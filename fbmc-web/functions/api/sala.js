// /api/sala  -> salas para llenar un mismo lienzo en vivo con el equipo.
//   POST  {crear:true, estado}            crea una sala con el lienzo actual y devuelve su código
//   POST  ?id=SALA {c, v, cambios:[[k,val]]} guarda cambios de casillas (cada uno queda numerado)
//   GET   ?id=SALA&v=N&c=CLIENTE[&p=1]     devuelve los cambios posteriores a N (o el lienzo completo si v<0)
// No existe ninguna ruta para borrar salas: solo quien administra Cloudflare puede hacerlo.
const MAX_BYTES = 300000;   // tamaño máximo de una solicitud
const MAX_STATE = 600000;   // tamaño máximo del lienzo guardado en la sala
const MAX_DIFF = 300;       // si alguien va más atrás que esto, recibe el lienzo completo
const KEEP = 400;           // cambios que se conservan por sala
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ID_RE = /^[A-Z0-9]{4,12}$/;
const KEY_RE = /^(?:(?:meta|f)\.[A-Za-z0-9_]{1,40}|actors|productos|sim|checks|rojos|hyp)$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

function newId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((x) => ALPHA[x % ALPHA.length]).join('');
}

async function readBody(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw Object.assign(new Error('big'), { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BYTES) throw Object.assign(new Error('big'), { status: 413 });
  return JSON.parse(raw);
}

const since = async (db, id, v) =>
  (await db.prepare('SELECT v, k, val, c FROM sala_cambio WHERE sala = ?1 AND v > ?2 ORDER BY v LIMIT ?3')
    .bind(id, v, MAX_DIFF + 1).all()).results || [];

async function presence(db, id, c) {
  const now = Date.now();
  if (c) {
    await db.prepare('INSERT INTO sala_presencia (sala, c, visto) VALUES (?1, ?2, ?3) ON CONFLICT (sala, c) DO UPDATE SET visto = excluded.visto')
      .bind(id, c, now).run();
  }
  const r = await db.prepare('SELECT COUNT(*) AS n FROM sala_presencia WHERE sala = ?1 AND visto > ?2').bind(id, now - 45000).first();
  return Math.max(1, (r && r.n) || 1);
}

async function full(db, id) {
  const s = await db.prepare('SELECT v, estado FROM sala WHERE id = ?1').bind(id).first();
  return s ? { v: s.v, estado: JSON.parse(s.estado) } : null;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return json({ ok: false, error: 'La base de datos no está conectada (falta el binding DB)' }, 500);
    const q = new URL(request.url).searchParams;
    const id = clip(q.get('id'), 12).toUpperCase();
    if (!ID_RE.test(id)) return json({ ok: false, error: 'Código de sala no válido' }, 400);
    const v = parseInt(q.get('v'), 10);
    const row = await env.DB.prepare('SELECT v FROM sala WHERE id = ?1').bind(id).first();
    if (!row) return json({ ok: false, error: 'La sala no existe' }, 404);

    const out = { ok: true, v: row.v };
    if (q.get('p')) out.n = await presence(env.DB, id, clip(q.get('c'), 24));
    if (!Number.isFinite(v) || v < 0 || row.v - v > MAX_DIFF) return json(Object.assign(out, await full(env.DB, id)));
    if (v >= row.v) return json(out);
    out.cambios = await since(env.DB, id, v);
    return json(out);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Error del servidor' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ ok: false, error: 'La base de datos no está conectada (falta el binding DB)' }, 500);
    let body;
    try { body = await readBody(request); } catch (e) {
      return json({ ok: false, error: e.status === 413 ? 'Los datos son demasiado grandes' : 'Datos no válidos' }, e.status || 400);
    }
    if (!body || typeof body !== 'object' || body.website) return json({ ok: false, error: 'Envío rechazado' }, 400);

    /* Crear una sala nueva con el lienzo actual */
    if (body.crear) {
      const e = body.estado;
      if (!e || typeof e !== 'object' || Array.isArray(e)) return json({ ok: false, error: 'Lienzo no válido' }, 400);
      if (!e.meta || typeof e.meta !== 'object') e.meta = {};
      if (!e.f || typeof e.f !== 'object') e.f = {};
      const s = JSON.stringify(e);
      if (s.length > MAX_STATE) return json({ ok: false, error: 'El lienzo es demasiado grande' }, 413);
      for (let i = 0; i < 6; i++) {
        const id = newId();
        try {
          await env.DB.prepare('INSERT INTO sala (id, estado) VALUES (?1, ?2)').bind(id, s).run();
          return json({ ok: true, id, v: 0 });
        } catch (err) {
          if (!/UNIQUE|constraint/i.test(String(err && err.message))) throw err;
        }
      }
      return json({ ok: false, error: 'No se pudo crear la sala, inténtalo de nuevo' }, 500);
    }

    /* Guardar cambios en una sala */
    const id = clip(new URL(request.url).searchParams.get('id'), 12).toUpperCase();
    if (!ID_RE.test(id)) return json({ ok: false, error: 'Código de sala no válido' }, 400);
    const c = clip(body.c, 24);
    const v = Math.max(0, parseInt(body.v, 10) || 0);
    const cambios = Array.isArray(body.cambios) ? body.cambios : [];
    if (!c || !cambios.length || cambios.length > 80) return json({ ok: false, error: 'Cambios no válidos' }, 400);
    for (const ch of cambios) {
      if (!Array.isArray(ch) || !KEY_RE.test(ch[0]) || typeof ch[1] !== 'string' || ch[1].length > 150000) {
        return json({ ok: false, error: 'Cambios no válidos' }, 400);
      }
      try { JSON.parse(ch[1]); } catch { return json({ ok: false, error: 'Cambios no válidos' }, 400); }
    }
    const row = await env.DB.prepare('SELECT v FROM sala WHERE id = ?1').bind(id).first();
    if (!row) return json({ ok: false, error: 'La sala no existe' }, 404);

    const db = env.DB, stmts = [];
    for (const [k, val] of cambios) {
      stmts.push(db.prepare("UPDATE sala SET estado = json_set(estado, ?1, json(?2)), v = v + 1, actualizado = datetime('now') WHERE id = ?3 AND length(estado) < ?4")
        .bind('$.' + k, val, id, MAX_STATE));
      stmts.push(db.prepare('INSERT INTO sala_cambio (sala, v, k, val, c) SELECT id, v, ?1, ?2, ?3 FROM sala WHERE id = ?4')
        .bind(k, val, c, id));
    }
    try { await db.batch(stmts); } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'No se pudo guardar el cambio (¿la sala está llena?)' }, 409);
    }

    const now = await db.prepare('SELECT v FROM sala WHERE id = ?1').bind(id).first();
    const out = { ok: true, v: now.v };
    const list = await since(db, id, v);
    if (list.length > MAX_DIFF) Object.assign(out, await full(db, id)); else out.cambios = list;
    if (Math.random() < 0.05) {
      await db.batch([
        db.prepare('DELETE FROM sala_cambio WHERE sala = ?1 AND v <= ?2').bind(id, now.v - KEEP),
        db.prepare('DELETE FROM sala_presencia WHERE visto < ?1').bind(Date.now() - 86400000),
      ]);
    }
    return json(out);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Error del servidor' }, 500);
  }
}
