// POST /api/fmbc  -> guarda un FMBC enviado desde la herramienta.
// Solo inserta: no existe ninguna ruta para editar ni borrar.
const MAX_BYTES = 300000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return json({ ok: false, error: 'La base de datos no está conectada (falta el binding DB)' }, 500);

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return json({ ok: false, error: 'El lienzo es demasiado grande' }, 413);
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json({ ok: false, error: 'El lienzo es demasiado grande' }, 413);

    let body;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'Datos no válidos' }, 400); }

    if (body.website) return json({ ok: false, error: 'Envío rechazado' }, 400); // trampa anti-spam
    const fmbc = body.fmbc;
    if (!fmbc || fmbc.formato !== 'FMBC-ES' || typeof fmbc.estado !== 'object') {
      return json({ ok: false, error: 'Formato de lienzo no reconocido' }, 400);
    }

    const meta = fmbc.estado.meta || {};
    const para = clip(meta.para, 200);
    const por = clip(meta.por, 300);
    if (!para || !por) return json({ ok: false, error: 'Faltan “Diseñado para” o “Diseñado por”' }, 400);

    const casillas = Math.max(0, Math.min(17, parseInt(body.casillas, 10) || 0));
    const pais = clip(request.cf && request.cf.country, 2) || null;

    const res = await env.DB.prepare(
      'INSERT INTO fmbc (para, por, fecha_modelo, casillas, pais, datos, resumen_md) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    )
      .bind(para, por, clip(meta.fecha, 20), casillas, pais, JSON.stringify(fmbc), clip(body.markdown, MAX_BYTES))
      .run();

    return json({ ok: true, id: res.meta.last_row_id });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Error del servidor' }, 500);
  }
}

export function onRequestGet() {
  return json({ ok: true, info: 'Servicio FMBC activo. Envía los lienzos con POST.' });
}
