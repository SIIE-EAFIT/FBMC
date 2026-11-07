// GET /api/ejemplos        -> lista de lienzos que la coordinación publicó como ejemplo
// GET /api/ejemplos?id=12  -> un ejemplo completo (solo si está publicado)
// Público y de solo lectura. Por privacidad no se entregan los nombres de quienes lo diseñaron.
const json = (obj, status = 200, cache = 'public, max-age=60') =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'La base de datos no está conectada' }, 500, 'no-store');
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  try {
    if (id) {
      const row = await env.DB.prepare('SELECT id, para, datos FROM fbmc WHERE id = ?1 AND publico = 1').bind(id).first();
      if (!row) return json({ ok: false, error: 'Ese ejemplo no está disponible' }, 404, 'no-store');
      let datos = {};
      try { datos = JSON.parse(row.datos); } catch { /* datos dañados */ }
      const estado = datos.estado || datos;
      if (estado && estado.meta) estado.meta.por = '';
      return json({ ok: true, id: row.id, para: row.para, estado });
    }
    const { results } = await env.DB.prepare(
      'SELECT id, para, fecha_modelo, casillas FROM fbmc WHERE publico = 1 ORDER BY id DESC LIMIT 100'
    ).all();
    return json({ ok: true, items: results });
  } catch (err) {
    // Si aún no existe la columna "publico", simplemente no hay ejemplos.
    return json({ ok: true, items: [] }, 200, 'no-store');
  }
}
