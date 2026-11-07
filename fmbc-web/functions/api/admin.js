// GET /api/admin           -> lista de envíos (sin el contenido completo)
// GET /api/admin?id=12     -> un envío completo
// GET /api/admin?all=1     -> todos los envíos completos (para exportar CSV)
// Requiere el encabezado x-admin-key igual al secreto ADMIN_KEY. Solo lectura.
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_KEY) return json({ ok: false, error: 'Falta configurar el secreto ADMIN_KEY' }, 500);
  if (!sameKey(request.headers.get('x-admin-key') || '', env.ADMIN_KEY)) {
    return json({ ok: false, error: 'Clave incorrecta' }, 401);
  }
  if (!env.DB) return json({ ok: false, error: 'La base de datos no está conectada (falta el binding DB)' }, 500);

  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '', 10);

  if (id) {
    const item = await env.DB.prepare('SELECT * FROM fmbc WHERE id = ?1').bind(id).first();
    return item ? json({ ok: true, item }) : json({ ok: false, error: 'No existe ese envío' }, 404);
  }
  if (url.searchParams.get('all')) {
    const { results } = await env.DB.prepare('SELECT * FROM fmbc ORDER BY id DESC').all();
    return json({ ok: true, items: results });
  }
  const { results } = await env.DB.prepare(
    'SELECT id, creado, para, por, fecha_modelo, casillas, pais FROM fmbc ORDER BY id DESC LIMIT 2000'
  ).all();
  return json({ ok: true, items: results });
}
