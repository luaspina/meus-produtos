'use strict';
// Sincroniza a lista inteira com uma linha da tabela "estado" no Supabase.
// Usa só fetch (sem biblioteca), então o app continua abrindo offline.
// Regra: vale a versão alterada por último; o aparelho que mudou algo envia logo depois.

const Sync = (() => {
  const ativo = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  const base = () => SUPABASE_URL.replace(/\/+$/, '');
  const CHAVE = 'sb-sessao';
  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(CHAVE)); } catch {}
  let envioPendente = null;
  let ocupado = Promise.resolve();

  const guardar = s => {
    sessao = s;
    try { s ? localStorage.setItem(CHAVE, JSON.stringify(s)) : localStorage.removeItem(CHAVE); } catch {}
  };

  async function auth(params, corpo) {
    const r = await fetch(`${base()}/auth/v1/token?grant_type=${params}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Falha no login');
    guardar({ access: j.access_token, refresh: j.refresh_token, expira: Date.now() + (j.expires_in - 60) * 1000,
      email: j.user && j.user.email, uid: j.user && j.user.id });
    return sessao;
  }

  async function token() {
    if (!sessao) throw new Error('sem login');
    if (Date.now() > sessao.expira) await auth('refresh_token', { refresh_token: sessao.refresh });
    return sessao.access;
  }

  async function rest(metodo, caminho, corpo, extra = {}) {
    const r = await fetch(`${base()}/rest/v1/${caminho}`, {
      method: metodo,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + await token(),
        'Content-Type': 'application/json', ...extra },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (r.status === 401) { guardar(null); throw new Error('Sessão expirou, entre de novo'); }
    if (!r.ok) throw new Error((await r.text()).slice(0, 200));
    return r.status === 204 ? null : r.json();
  }

  const remoto = async () => (await rest('GET', 'estado?select=dados,alterado_em&limit=1'))[0] || null;

  async function enviar() {
    await rest('POST', 'estado', { user_id: sessao.uid, dados: { produtos }, alterado_em: meta.alteradoEm || Date.now() },
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    meta.sincronizadoEm = meta.alteradoEm || Date.now();
    await salvarMeta();
  }

  // Busca a versão da nuvem e decide quem vence. Retorna true se a lista local mudou.
  function puxar() {
    if (!ativo() || !sessao || !navigator.onLine) return Promise.resolve(false);
    return (ocupado = ocupado.then(async () => {
      const r = await remoto();
      const local = meta.alteradoEm || 0, ultimo = meta.sincronizadoEm || 0;
      if (!r) { await enviar(); return false; }
      if (r.alterado_em > ultimo && r.alterado_em >= local) {
        produtos = r.dados.produtos || [];
        await db.set('produtos', produtos);
        meta.alteradoEm = meta.sincronizadoEm = r.alterado_em;
        await salvarMeta();
        return true;
      }
      if (local > ultimo) await enviar();
      return false;
    }).catch(e => { console.warn('sync', e); estado.erro = e.message; return false; }));
  }

  // Chamado depois de cada mudança sua: envia em seguida.
  function mudou() {
    if (!ativo() || !sessao) return;
    clearTimeout(envioPendente);
    envioPendente = setTimeout(() => {
      ocupado = ocupado.then(() => navigator.onLine && enviar()).catch(e => { estado.erro = e.message; });
    }, 1500);
  }

  const estado = { erro: '' };

  return {
    ativo, estado, puxar, mudou,
    logado: () => !!sessao,
    email: () => sessao && sessao.email,
    async entrar(email, senha) { await auth('password', { email, password: senha }); estado.erro = ''; },
    sair() { guardar(null); meta.sincronizadoEm = 0; return salvarMeta(); },
    // Primeira vez num aparelho: a nuvem já tem dados?
    temRemoto: async () => !!(await remoto()),
    enviarAgora: () => (ocupado = ocupado.then(enviar)),
  };
})();
