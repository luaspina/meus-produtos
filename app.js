'use strict';
// Meus Produtos — tudo salvo no próprio aparelho (IndexedDB, com localStorage de reserva).

const CATS = ['Cabelo', 'Corpo', 'Rosto'];
const ICONE = { Cabelo: '💇‍♀️', Corpo: '🧴', Rosto: '🧖‍♀️' };
const QTD = { cheio: 'Cheio', medio: 'Médio', baixo: 'Baixo' };
const DEC = { recomprar: 'Recomprar', talvez: 'Se precisar', nao: 'Não recomprar', indefinido: 'Indefinido' };
const DIA = 86400000;

let produtos = [];
let meta = { ultimoBackup: null };
const filtros = { q: '', nota: '', qtd: '', dec: '', val: '', cat: '', conf: '' };

// ---------- Armazenamento ----------
const db = (() => {
  let p;
  const abrir = () => p || (p = new Promise((ok, erro) => {
    const r = indexedDB.open('meus-produtos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  }));
  const tx = (modo, fn) => abrir().then(d => new Promise((ok, erro) => {
    const t = d.transaction('kv', modo);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => erro(t.error);
  }));
  return {
    get: k => tx('readonly', s => s.get(k)).catch(() => {
      try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
    }),
    set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {
      localStorage.setItem(k, JSON.stringify(v));
    }),
  };
})();

async function carregar() {
  produtos = await db.get('produtos');
  meta = (await db.get('meta')) || { ultimoBackup: null };
  // Os dados iniciais entram só na primeira vez. Atualizar o app nunca sobrescreve o que você editou.
  if (!Array.isArray(produtos)) {
    produtos = SEED.map(p => ({ ...p, criadoEm: Date.now(), editadoEm: null }));
    await salvarTudo(false);
  }
  // Cada correção vale uma vez só, pra não desfazer o que você mudar depois.
  meta.correcoesAplicadas = meta.correcoesAplicadas || [];
  for (const c of CORRECOES) {
    const chave = c.chave || c.id + ':' + c.de;
    if (meta.correcoesAplicadas.includes(chave)) continue;
    const p = produtos.find(x => x.id === c.id);
    if (p && p.nome === c.de) Object.assign(p, c.para);
    meta.correcoesAplicadas.push(chave);
  }
  // Produtos novos que vieram numa atualização do app.
  const jaVistos = meta.extrasAplicados || [];
  for (const e of EXTRAS) if (!jaVistos.includes(e.id) && !produtos.some(p => p.id === e.id)) produtos.push({ ...e, criadoEm: Date.now(), editadoEm: null });
  meta.extrasAplicados = EXTRAS.map(e => e.id);
  await salvarTudo(false);
  // Coloca as fotos novas do app sem mexer em nada que você já editou.
  let mudou = false;
  for (const p of produtos) if (!p.foto && FOTOS[p.id] && !(meta.fotosAplicadas || []).includes(p.id)) { p.foto = FOTOS[p.id]; mudou = true; }
  meta.fotosAplicadas = Object.keys(FOTOS);
  if (mudou) await salvarTudo(false);
  await salvarMeta();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

let salvando = Promise.resolve();
// usuario=false para gravações automáticas do próprio app (não contam como mudança sua).
function salvarTudo(usuario = true) {
  if (usuario) { meta.alteradoEm = Date.now(); salvarMeta(); }
  salvando = salvando.then(() => db.set('produtos', produtos)).then(() => { if (usuario) Sync.mudou(); }).catch(e => {
    toast('⚠️ Não consegui salvar: ' + e.message);
    throw e;
  });
  return salvando;
}
const salvarMeta = () => db.set('meta', meta);

// Confirmação dentro do app (alguns navegadores bloqueiam a janela padrão).
function confirmar(msg, sim = 'Excluir') {
  return new Promise(ok => {
    const d = document.createElement('div');
    d.className = 'modal';
    d.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">
      <p>${esc(msg).replace(/\n/g, '<br>')}</p>
      <button class="btn danger-cheio" data-r="1">${esc(sim)}</button>
      <button class="btn sec" data-r="0">Cancelar</button></div>`;
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b) return; // tocar fora não escolhe nada
      d.remove(); ok(b.dataset.r === '1');
    });
    document.body.appendChild(d);
  });
}

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const diasAte = v => v ? Math.round((new Date(v + 'T00:00:00') - hoje()) / DIA) : null;
const fmtData = v => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '';
const nomeCompleto = p => [p.marca, p.nome].filter(Boolean).join(' — ');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

function thumb(p, cls = '') {
  return `<div class="thumb ${esc(p.categoria)} ${cls}">${p.foto ? `<img src="${p.foto}" alt="">` : (ICONE[p.categoria] || '✨')}</div>`;
}

function tagsDe(p) {
  const t = [];
  if (p.nota) t.push(`<span class="mini-stars">${'★'.repeat(p.nota)}</span>`);
  if (p.quantidade) t.push(`<span class="tag ${p.quantidade}">${QTD[p.quantidade]}</span>`);
  const d = diasAte(p.validade);
  if (d !== null) {
    if (d < 0) t.push(`<span class="tag vencido">Venceu ${fmtData(p.validade)}</span>`);
    else if (d <= 60) t.push(`<span class="tag vence">Vence em ${d} dia${d === 1 ? '' : 's'}</span>`);
    else t.push(`<span class="tag">Val. ${fmtData(p.validade)}</span>`);
  }
  if (p.decisao === 'recomprar') t.push('<span class="tag recomprar">Recomprar</span>');
  if (p.decisao === 'talvez') t.push('<span class="tag talvez">Se precisar</span>');
  if (p.decisao === 'nao') t.push('<span class="tag">Não recomprar</span>');
  if (p.conferir) t.push('<span class="tag conf">a conferir</span>');
  return t.join('');
}

function itemHTML(p, extra = '') {
  return `<a class="item" href="#p/${p.id}">
    <button type="button" class="apagar" data-apagar="${p.id}" aria-label="Excluir ${esc(p.nome)}">✕</button>
    ${thumb(p)}
    <div class="info">
      ${p.marca ? `<div class="marca">${esc(p.marca)}</div>` : ''}
      <div class="nome">${esc(p.nome)}</div>
      ${extra || `<div class="desc">${esc(p.descricao)}</div>`}
      <div class="tags">${tagsDe(p)}</div>
    </div></a>`;
}

// ---------- Lista principal ----------
// Ordem dentro de cada subcategoria: primeiro a decisão, depois as estrelas.
const PESO_DEC = { recomprar: 0, talvez: 1, indefinido: 2, nao: 3 };
const ordemLista = (a, b) => (PESO_DEC[a.decisao] ?? 2) - (PESO_DEC[b.decisao] ?? 2) || (b.nota || 0) - (a.nota || 0);
// Palavras parecidas, pra busca achar produtos com nomes em outras línguas.
const GRUPOS = [
  ['retinol', 'retinal', 'retinoide', 'retin'], ['protetor', 'spf', 'sunscreen', 'uv', 'sun'],
  ['hidratante', 'hidrat', 'moist', 'hydrat', 'hyalu', 'hialur'], ['oleo', 'oil', 'huile'],
  ['mascara', 'mask', 'masque', 'pack'], ['olho', 'olhos', 'eye', 'olheira'], ['cilios', 'eyelash'],
  ['esfoliante', 'scrub', 'polish', 'peeling', 'bha', 'aha', 'esfolia'],
  ['limpeza', 'limpador', 'cleans', 'wash', 'demaquilante', 'foam'], ['perfume', 'parfum', 'toilette'],
  ['condicionador', 'conditioner'], ['sabonete', 'soap', 'body wash'], ['loiro', 'blond'],
  ['vitamina', 'vit'], ['mancha', 'brighten', 'clare', 'whiten', 'uniformiz'],
];
const sinonimos = t => {
  const g = GRUPOS.find(g => g.some(s => t.startsWith(s) || s.startsWith(t) && t.length >= 4));
  return g ? [t, ...g] : [t];
};
function passaFiltros(p) {
  if (filtros.q) {
    const termos = norm(filtros.q).split(/\s+/).filter(Boolean);
    const alvo = norm([p.marca, p.nome, p.descricao, p.sub, p.categoria, p.obs].join(' '));
    if (!termos.every(t => sinonimos(t).some(s => alvo.includes(s)))) return false;
  }
  if (filtros.cat && p.categoria !== filtros.cat) return false;
  if (filtros.nota === '0' && p.nota) return false;
  if (filtros.nota && filtros.nota !== '0' && (p.nota || 0) < +filtros.nota) return false;
  if (filtros.qtd === 'sem' ? p.quantidade : filtros.qtd && p.quantidade !== filtros.qtd) return false;
  if (filtros.dec && p.decisao !== filtros.dec) return false;
  if (filtros.val) {
    const d = diasAte(p.validade);
    if (filtros.val === 'sem' && d !== null) return false;
    if (filtros.val === 'com' && d === null) return false;
    if (filtros.val === 'vencido' && !(d !== null && d < 0)) return false;
    if (filtros.val === '60' && !(d !== null && d >= 0 && d <= 60)) return false;
  }
  if (filtros.conf && !p.conferir) return false;
  return true;
}

function sel(id, rotulo, opcoes) {
  const v = filtros[id] || '';
  return `<select data-f="${id}" class="${v ? 'active' : ''}" aria-label="${rotulo}">
    <option value="">${rotulo}</option>
    ${opcoes.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}
  </select>`;
}

function telaLista() {
  $('#titulo').textContent = 'Meus produtos';
  const ativos = ['nota', 'qtd', 'dec', 'val', 'cat', 'conf'].some(k => filtros[k]);
  $('#app').innerHTML = `
    <input class="search" type="search" id="busca" placeholder="Buscar: protetor solar, retinol, shampoo…"
      value="${esc(filtros.q)}" autocomplete="off" enterkeyhint="search">
    <div class="filters">
      ${sel('cat', 'Categoria', CATS.map(c => [c, c]))}
      ${sel('nota', 'Nota', [['5', '★★★★★'], ['4', '★★★★ ou +'], ['3', '★★★ ou +'], ['1', 'Com nota'], ['0', 'Sem nota']])}
      ${sel('qtd', 'Quantidade', [['cheio', 'Cheio'], ['medio', 'Médio'], ['baixo', 'Baixo'], ['sem', 'Não informada']])}
      ${sel('dec', 'Decisão', [['recomprar', 'Recomprar'], ['talvez', 'Se precisar'], ['nao', 'Não recomprar'], ['indefinido', 'Indefinido']])}
      ${sel('val', 'Validade', [['60', 'Vence em 60 dias'], ['vencido', 'Vencidos'], ['com', 'Com validade'], ['sem', 'Sem validade']])}
      ${sel('conf', 'A conferir', [['1', 'Só a conferir']])}
      ${ativos ? '<button class="btn small sec" id="limpar">Limpar</button>' : ''}
    </div>
    <div id="res"></div>`;
  const busca = $('#busca');
  busca.addEventListener('input', () => { filtros.q = busca.value; desenharResultados(); });
  document.querySelectorAll('[data-f]').forEach(s => s.addEventListener('change', () => {
    filtros[s.dataset.f] = s.value; telaLista();
  }));
  const l = $('#limpar');
  if (l) l.onclick = () => { Object.assign(filtros, { nota: '', qtd: '', dec: '', val: '', cat: '', conf: '' }); telaLista(); };
  desenharResultados();
}

function desenharResultados() {
  const lista = produtos.filter(passaFiltros);
  const buscando = !!filtros.q;
  let h = `<div class="count">${lista.length} de ${produtos.length} produtos</div>`;
  if (!lista.length) h += `<div class="empty">Nada encontrado${buscando ? ` para “${esc(filtros.q)}”. Você ainda não tem algo parecido.` : '.'}</div>`;
  for (const c of CATS) {
    const doGrupo = lista.filter(p => p.categoria === c);
    if (!doGrupo.length) continue;
    const subs = [...new Set(doGrupo.map(p => p.sub || 'Outros'))].sort((a, b) => a.localeCompare(b, 'pt'));
    h += `<details class="grupo" ${aberto(c) ? 'open' : ''} data-c="${c}"><summary>${ICONE[c]} ${c} <small>${doGrupo.length}</small></summary>`;
    for (const s of subs) {
      // Subcategorias começam recolhidas; abrem sozinhas só quando há busca ou filtro.
      const daSub = doGrupo.filter(p => (p.sub || 'Outros') === s);
      const filtrando = filtros.q || ['nota', 'qtd', 'dec', 'val', 'conf'].some(k => filtros[k]);
      h += `<details class="subgrupo" data-k="${esc(c + '/' + s)}" ${filtrando || subAberta(c + '/' + s) ? 'open' : ''}><summary class="sub ${daSub.every(p => p.foto) ? 'completa' : ''}">${esc(s)} <small>${daSub.length}</small></summary>`;
      h += [...daSub].sort(ordemLista).map(p => itemHTML(p)).join('') + '</details>';
    }
    h += '</details>';
  }
  $('#res').innerHTML = h;
  document.querySelectorAll('details.grupo').forEach(d => d.addEventListener('toggle', () => guardarAberto(d.dataset.c, d.open)));
  // Lembra as subcategorias que você abriu (só quando não há busca/filtro abrindo tudo).
  const filtrandoAgora = filtros.q || ['nota', 'qtd', 'dec', 'val', 'conf'].some(k => filtros[k]);
  if (!filtrandoAgora) document.querySelectorAll('details.subgrupo').forEach(d => d.addEventListener('toggle', () => guardarSub(d.dataset.k, d.open)));
}

function aberto(c) {
  if (filtros.q || filtros.cat) return true;
  try { return localStorage.getItem('aberto-' + c) !== '0'; } catch { return true; }
}
function subAberta(k) { try { return localStorage.getItem('sub-' + k) === '1'; } catch { return false; } }
function guardarSub(k, v) { try { v ? localStorage.setItem('sub-' + k, '1') : localStorage.removeItem('sub-' + k); } catch {} }
function guardarAberto(c, v) { try { localStorage.setItem('aberto-' + c, v ? '1' : '0'); } catch {} }

// ---------- Usar logo ----------
function telaUsar() {
  $('#titulo').textContent = 'Usar logo';
  const lista = produtos.filter(p => { const d = diasAte(p.validade); return d !== null && d <= 60; })
    .sort((a, b) => a.validade.localeCompare(b.validade));
  const semVal = produtos.filter(p => !p.validade).length;
  $('#app').innerHTML = `<p class="intro">Produtos vencendo nos próximos 60 dias (e os já vencidos), do mais próximo ao mais distante.</p>
    ${lista.length ? lista.map(p => itemHTML(p)).join('') : '<div class="empty">Nenhum produto vencendo nos próximos 60 dias. 🎉</div>'}
    ${semVal ? `<p class="intro">${semVal} produtos ainda estão sem data de validade.</p>` : ''}`;
}

// ---------- Comprar na promoção ----------
function telaComprar() {
  $('#titulo').textContent = 'Comprar na promoção';
  const ordem = (a, b) => CATS.indexOf(a.categoria) - CATS.indexOf(b.categoria) || nomeCompleto(a).localeCompare(nomeCompleto(b), 'pt');
  const baixos = produtos.filter(p => p.quantidade === 'baixo');
  const sim = baixos.filter(p => p.decisao === 'recomprar').sort(ordem);
  const talvez = baixos.filter(p => p.decisao === 'talvez').sort(ordem);
  $('#app').innerHTML = `<p class="intro">Produtos com quantidade <b>baixa</b> que você quer recomprar.</p>
    ${sim.length ? sim.map(p => itemHTML(p)).join('') : '<div class="empty">Nada na lista agora. Marque um produto como “Baixo” e “Recomprar” pra ele aparecer aqui.</div>'}
    ${talvez.length ? `<h2 class="sub" style="margin-top:20px">Se precisar</h2>${talvez.map(p => itemHTML(p)).join('')}` : ''}`;
}

// ---------- Tela do produto ----------
function telaProduto(id) {
  const novo = id === 'novo';
  const original = novo
    ? { id: 'n' + Date.now().toString(36), marca: '', nome: '', categoria: filtros.cat || 'Rosto', sub: '', descricao: '', nota: 0, quantidade: '', validade: '', decisao: 'indefinido', obs: '', conferir: false, foto: '' }
    : produtos.find(p => p.id === id);
  if (!original) { location.hash = '#lista'; return; }
  const p = { ...original };
  $('#titulo').textContent = novo ? 'Novo produto' : 'Produto';

  const subsDe = c => [...new Set(produtos.filter(x => x.categoria === c).map(x => x.sub).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  const segs = (campo, mapa) => `<div class="seg" data-seg="${campo}">${Object.entries(mapa).map(([k, t]) =>
    `<button type="button" data-v="${k}" class="${p[campo] === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;

  $('#app').innerHTML = `
    <a class="back" href="#lista" id="voltar">‹ Voltar</a>
    <form class="form" id="form" autocomplete="off">
      <div class="foto-box">
        <div id="fotoThumb">${thumb(p)}</div>
        <div>
          <label class="btn small sec" for="foto" style="margin:0">📷 ${p.foto ? 'Trocar foto' : 'Adicionar foto'}</label>
          <input type="file" id="foto" accept="image/*" hidden>
          <a class="btn small sec" id="buscarFoto" target="_blank" rel="noopener" style="margin-top:8px">🔍 Buscar foto na internet</a>
          <button type="button" class="btn small sec" id="tirarFoto" ${p.foto ? '' : 'hidden'} style="margin-top:8px">Remover foto</button>
        </div>
      </div>
      <div><label for="marca">Marca / linha</label><input type="text" id="marca" value="${esc(p.marca)}"></div>
      <div><label for="nome">Nome do produto</label><input type="text" id="nome" value="${esc(p.nome)}" required></div>
      <div class="row2">
        <div><label for="categoria">Categoria</label>
          <select id="categoria">${CATS.map(c => `<option ${p.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label for="sub">Subcategoria</label>
          <input type="text" id="sub" list="subs" value="${esc(p.sub)}"><datalist id="subs">${subsDe(p.categoria).map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      </div>
      <div><label for="descricao">Pra que serve</label><textarea id="descricao" rows="2">${esc(p.descricao)}</textarea></div>
      <div><span class="lbl">Nota</span>
        <div class="stars" id="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${p.nota >= n ? 'on' : ''}" aria-label="${n} estrela${n > 1 ? 's' : ''}">★</button>`).join('')}
        <button type="button" class="clear" data-n="0">limpar</button></div></div>
      <div><span class="lbl">Quantidade</span>${segs('quantidade', QTD)}</div>
      <div><label for="validade">Validade (opcional)</label>
        <input type="date" id="validade" value="${esc(p.validade)}"></div>
      <div><span class="lbl">Decisão</span>${segs('decisao', DEC).replace('class="seg"', 'class="seg seg-2x2"')}</div>
      <div><label for="obs">Observações</label><textarea id="obs" rows="3">${esc(p.obs)}</textarea></div>
      <label class="check"><input type="checkbox" id="conferir" ${p.conferir ? 'checked' : ''}> Marcado como “a conferir”</label>
      <div class="savebar">
        <button class="btn" type="submit" id="salvar">Salvar</button>
        <div class="status" id="status">${novo ? '' : 'As mudanças também são salvas sozinhas.'}</div>
      </div>
      ${novo ? '' : '<button type="button" class="btn danger" id="excluir">Excluir produto</button>'}
    </form>`;

  const f = $('#form');
  const status = $('#status');
  let pendente = null;

  const ler = () => {
    for (const k of ['marca', 'nome', 'sub', 'descricao', 'validade', 'obs']) p[k] = f.querySelector('#' + k).value.trim();
    p.categoria = f.querySelector('#categoria').value;
    p.conferir = f.querySelector('#conferir').checked;
  };

  async function gravar(manual) {
    ler();
    if (!p.nome) { if (manual) { toast('Dê um nome ao produto'); $('#nome').focus(); } return false; }
    p.editadoEm = Date.now();
    const i = produtos.findIndex(x => x.id === p.id);
    if (i >= 0) produtos[i] = { ...p }; else produtos.push({ ...p, criadoEm: Date.now() });
    await salvarTudo();
    status.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' ✓';
    return true;
  }
  // Salvamento automático (só para produtos que já existem; um novo é criado ao tocar em Salvar)
  const agendar = () => {
    if (novo && !produtos.some(x => x.id === p.id)) return;
    status.textContent = 'Salvando…';
    clearTimeout(pendente);
    pendente = setTimeout(() => { pendente = null; gravar(false); }, 300);
  };
  // Se o app for fechado, minimizado ou trocar de tela, grava na hora o que estiver pendente.
  const salvarJa = () => { if (pendente) { clearTimeout(pendente); pendente = null; gravar(false); } };
  document.addEventListener('visibilitychange', salvarJa);
  window.addEventListener('pagehide', salvarJa);
  window.addEventListener('hashchange', function sair() {
    salvarJa();
    document.removeEventListener('visibilitychange', salvarJa);
    window.removeEventListener('pagehide', salvarJa);
    window.removeEventListener('hashchange', sair);
  });

  f.addEventListener('input', agendar);
  f.addEventListener('change', agendar);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    clearTimeout(pendente);
    if (await gravar(true)) { toast('Salvo ✓'); if (novo) location.replace('#p/' + p.id); }
  });
  $('#categoria').addEventListener('change', () => {
    $('#subs').innerHTML = subsDe($('#categoria').value).map(s => `<option value="${esc(s)}">`).join('');
  });

  $('#stars').addEventListener('click', e => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    const n = +b.dataset.n;
    p.nota = p.nota === n ? 0 : n;
    $('#stars').querySelectorAll('[data-n]').forEach(x => x.classList.toggle('on', +x.dataset.n > 0 && p.nota >= +x.dataset.n));
    agendar();
  });
  f.querySelectorAll('[data-seg]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const campo = g.dataset.seg;
    p[campo] = (campo === 'quantidade' && p[campo] === b.dataset.v) ? '' : b.dataset.v;
    g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === p[campo]));
    agendar();
  }));

  $('#foto').addEventListener('change', async e => {
    const arq = e.target.files[0]; if (!arq) return;
    try {
      p.foto = await reduzirFoto(arq);
      $('#fotoThumb').innerHTML = thumb(p);
      $('#tirarFoto').hidden = false;
      agendar();
    } catch { toast('Não consegui abrir essa foto'); }
  });
  // Abre a busca de imagens do Google já com o nome do produto e "fundo branco".
  const linkBusca = () => {
    ler();
    $('#buscarFoto').href = 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(nomeCompleto(p) + ' produto fundo branco');
  };
  linkBusca();
  $('#buscarFoto').addEventListener('click', linkBusca);
  $('#tirarFoto').addEventListener('click', () => {
    p.foto = ''; $('#fotoThumb').innerHTML = thumb(p); $('#tirarFoto').hidden = true; agendar();
  });

  const ex = $('#excluir');
  if (ex) ex.addEventListener('click', async () => {
    if (!await confirmar(`Excluir “${nomeCompleto(p)}”?\n\nIsso não pode ser desfeito (a menos que você restaure um backup).`)) return;
    clearTimeout(pendente);
    produtos = produtos.filter(x => x.id !== p.id);
    await salvarTudo();
    toast('Produto excluído');
    location.hash = '#lista';
  });
}

// Reduz a foto pra ~800px em JPEG, pra caber bem no aparelho e no backup.
function reduzirFoto(arq) {
  return new Promise((ok, erro) => {
    const img = new Image();
    const url = URL.createObjectURL(arq);
    img.onload = () => {
      // Encaixa a foto inteira num quadrado branco, sem cortar o produto.
      const lado = 600, margem = 30, k = Math.min((lado - 2 * margem) / img.width, (lado - 2 * margem) / img.height);
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, lado, lado);
      g.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = erro;
    img.src = url;
  });
}

// ---------- Ajustes / backup ----------
function avisoBackup() {
  const d = meta.ultimoBackup ? Math.floor((Date.now() - meta.ultimoBackup) / DIA) : null;
  if (d === null) return 'Você ainda não fez nenhum backup.';
  if (d > 30) return `Seu último backup foi há ${d} dias.`;
  return '';
}

function telaConfig() {
  $('#titulo').textContent = 'Ajustes';
  const ult = meta.ultimoBackup ? new Date(meta.ultimoBackup).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
  const aviso = avisoBackup();
  $('#app').innerHTML = `
    ${aviso ? `<div class="alerta">⚠️ ${aviso} O Safari pode apagar dados de sites. Exporte um backup e guarde no app Arquivos.</div>` : ''}
    <div class="card">
      <h2>Backup</h2>
      <p>Último backup: <b>${ult}</b>. O arquivo inclui tudo, até as fotos.</p>
      <button class="btn" id="exportar">Exportar backup</button>
      <label class="btn sec" for="importar">Importar backup</label>
      <input type="file" id="importar" accept="application/json,.json" hidden>
    </div>
    <div class="card">
      <h2>Planilha</h2>
      <p>Exporta a lista em CSV (abre no Excel, Numbers ou Google Planilhas).</p>
      <button class="btn sec" id="csv">Exportar CSV</button>
    </div>
    ${cardSync()}
    <div class="card">
      <h2>Sobre</h2>
      <p>${produtos.length} produtos · ${produtos.filter(p => p.conferir).length} a conferir. Tudo fica salvo só neste aparelho, sem login e sem servidor.</p>
    </div>`;
  ligarSync();
  $('#exportar').onclick = exportarBackup;
  $('#csv').onclick = exportarCSV;
  $('#importar').onchange = importarBackup;
}

// ---------- Sincronização (Supabase) ----------
function cardSync() {
  if (!Sync.ativo()) return `<div class="card"><h2>Sincronizar</h2>
    <p>Ainda não configurado. Os dados ficam só neste aparelho.</p></div>`;
  if (!Sync.logado()) return `<div class="card"><h2>Sincronizar</h2>
    <p>Entre para usar a mesma lista no celular e no computador.</p>
    <form class="form" id="formLogin" autocomplete="on">
      <div><label for="sbEmail">E-mail</label><input type="text" id="sbEmail" inputmode="email" autocomplete="username" autocapitalize="off"></div>
      <div><label for="sbSenha">Senha</label><input type="password" id="sbSenha" autocomplete="current-password" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:17px"></div>
      <button class="btn" type="submit">Entrar</button>
    </form></div>`;
  const quando = meta.sincronizadoEm ? new Date(meta.sincronizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'ainda não';
  return `<div class="card"><h2>Sincronizar</h2>
    <p>Conectada como <b>${esc(Sync.email())}</b>. Última sincronização: <b>${quando}</b>.
    ${Sync.estado.erro ? `<br>⚠️ ${esc(Sync.estado.erro)}` : ''}</p>
    <button class="btn sec" id="sbAgora">Sincronizar agora</button>
    <button class="btn sec" id="sbSair">Sair</button></div>`;
}

function ligarSync() {
  const f = $('#formLogin');
  if (f) f.onsubmit = async e => {
    e.preventDefault();
    try {
      await Sync.entrar($('#sbEmail').value.trim(), $('#sbSenha').value);
      // Primeiro login neste aparelho: se a nuvem já tem dados, pergunta qual versão manter.
      if (await Sync.temRemoto()) {
        const daNuvem = await confirmar('A nuvem já tem uma lista salva.\n\nQuer usar a lista da nuvem neste aparelho? (Cancelar envia a lista deste aparelho para a nuvem.)', 'Usar a da nuvem');
        if (daNuvem) { meta.sincronizadoEm = 0; meta.alteradoEm = 0; }
        else { meta.alteradoEm = Date.now(); meta.sincronizadoEm = 0; }
        await salvarMeta();
      }
      await Sync.puxar();
      toast('Sincronizado ✓');
    } catch (err) { toast(err.message); }
    telaConfig();
  };
  const ag = $('#sbAgora');
  if (ag) ag.onclick = async () => { Sync.estado.erro = ''; await Sync.puxar(); toast(Sync.estado.erro || 'Sincronizado ✓'); telaConfig(); };
  const sa = $('#sbSair');
  if (sa) sa.onclick = async () => { await Sync.sair(); toast('Você saiu'); telaConfig(); };
}

async function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const arq = new File([blob], nome, { type: tipo });
  // No iPhone, o menu de compartilhar permite "Salvar em Arquivos".
  if (navigator.canShare && navigator.canShare({ files: [arq] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [arq], title: nome }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

const carimbo = () => new Date().toISOString().slice(0, 10);

async function exportarBackup() {
  const dados = JSON.stringify({ app: 'meus-produtos', versao: 1, exportadoEm: new Date().toISOString(), produtos }, null, 1);
  if (await baixar(`backup-produtos-${carimbo()}.json`, dados, 'application/json')) {
    meta.ultimoBackup = Date.now();
    await salvarMeta();
    toast('Backup exportado ✓');
    telaConfig();
  }
}

async function importarBackup(e) {
  const arq = e.target.files[0]; if (!arq) return;
  try {
    const dados = JSON.parse(await arq.text());
    const lista = Array.isArray(dados) ? dados : dados.produtos;
    if (!Array.isArray(lista) || !lista.every(p => p && p.id && typeof p.nome === 'string')) throw new Error('formato');
    const quando = dados.exportadoEm ? new Date(dados.exportadoEm).toLocaleString('pt-BR') : 'data desconhecida';
    if (!await confirmar(`Restaurar backup de ${quando} com ${lista.length} produtos?\n\nIsso substitui os ${produtos.length} produtos atuais.`, 'Restaurar')) return;
    produtos = lista;
    await salvarTudo();
    meta.ultimoBackup = meta.ultimoBackup || Date.now();
    await salvarMeta();
    toast('Backup restaurado ✓');
    telaConfig();
  } catch {
    toast('Esse arquivo não é um backup válido');
  } finally { e.target.value = ''; }
}

function exportarCSV() {
  const cols = [['Categoria', 'categoria'], ['Subcategoria', 'sub'], ['Marca / linha', 'marca'], ['Produto', 'nome'], ['Pra que serve', 'descricao'],
    ['Nota', p => p.nota || ''], ['Quantidade', p => QTD[p.quantidade] || ''], ['Validade', p => fmtData(p.validade)],
    ['Decisão', p => DEC[p.decisao] || ''], ['A conferir', p => p.conferir ? 'sim' : ''], ['Observações', 'obs']];
  const cel = v => { const s = String(v ?? ''); return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = [cols.map(c => c[0]).join(';'), ...produtos.map(p => cols.map(([, k]) => cel(typeof k === 'function' ? k(p) : p[k])).join(';'))];
  baixar(`produtos-${carimbo()}.csv`, '﻿' + linhas.join('\r\n'), 'text/csv');
}

// ---------- Navegação ----------
function rota() {
  const h = location.hash.slice(1) || 'lista';
  const [tela, id] = h.split('/');
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (tela === 'p' || tela === 'novo' ? 'lista' : tela)));
  $('#btnNovo').hidden = tela === 'p' || tela === 'novo';
  if (tela === 'p') telaProduto(id);
  else if (tela === 'novo') telaProduto('novo');
  else if (tela === 'usar') telaUsar();
  else if (tela === 'comprar') telaComprar();
  else if (tela === 'config') telaConfig();
  else telaLista();
  if (tela !== 'lista' || !rota.primeira) window.scrollTo(0, 0);
  rota.primeira = false;
}

$('#btnNovo').onclick = () => { location.hash = '#novo'; };
window.addEventListener('hashchange', rota);

// Botão ✕ na lista: exclui o produto depois de confirmar.
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-apagar]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const p = produtos.find(x => x.id === b.dataset.apagar); if (!p) return;
  if (!await confirmar(`Excluir “${nomeCompleto(p)}”?\n\nIsso não pode ser desfeito (a menos que você restaure um backup).`)) return;
  produtos = produtos.filter(x => x.id !== p.id);
  await salvarTudo();
  toast('Produto excluído');
  rota();
});

// Busca a versão da nuvem ao abrir e sempre que o app volta para a tela.
const puxarNuvem = () => Sync.puxar().then(mudou => { if (mudou && !location.hash.startsWith('#p/')) rota(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') puxarNuvem(); });

carregar().then(rota).then(puxarNuvem).catch(e => {
  $('#app').innerHTML = `<div class="empty">Erro ao abrir os dados: ${esc(e.message)}</div>`;
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Quando uma versão nova do app assume, recarrega uma vez pra já mostrar as novidades.
  const tinhaVersao = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinhaVersao) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
}
