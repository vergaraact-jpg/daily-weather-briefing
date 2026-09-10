const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NTFY_TOPIC = process.env.NTFY_TOPIC;

const LAT = 40.4168;
const LON = -3.7038;

async function run() {
  if (!GEMINI_API_KEY) throw new Error("Falta el secreto GEMINI_API_KEY");
  if (!NTFY_TOPIC) throw new Error("Falta el secreto NTFY_TOPIC");

  // 1. Clima Open-Meteo
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&current_weather=true&timezone=auto`;
  const wRes = await fetch(weatherUrl);
  if (!wRes.ok) throw new Error(`Fallo Open-Meteo: ${wRes.status}`);
  const wData = await wRes.json();

  const currentTemp = wData.current_weather.temperature;
  const rainProb = wData.daily.precipitation_probability_max[0];
  const uvMax = wData.daily.uv_index_max[0];
  const wind = wData.current_weather.windspeed;

  // 2. Consulta a Gemini
  const prompt = `Analiza estos datos meteorologicos en Madrid:
- Temp actual: ${currentTemp} C
- Prob. lluvia: ${rainProb}%
- UV max: ${uvMax}
- Viento: ${wind} km/h

Devuelve EXACTAMENTE una frase directa de maximo 80 caracteres para una notificacion matutina movil diciendo que ponerse o que llevar hoy. Sin comillas ni texto extra.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const gRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  if (!gRes.ok) {
    const errorBody = await gRes.text();
    throw new Error(`Error en Gemini: ${errorBody}`);
  }

  const gData = await gRes.json();
  const consejo = gData.candidates[0].content.parts[0].text.trim();

  // 3. Envio a ntfy (Cabeceras estrictamente ASCII para evitar ByteString error)
  const pushRes = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    body: consejo,
    headers: {
      "Title": `Madrid ${currentTemp}C - Clima hoy`,
      "Priority": "high",
      "Tags": "partly_sunny"
    }
  });

  if (!pushRes.ok) throw new Error(`Fallo ntfy: ${pushRes.status}`);
  console.log("Notificación despachada con éxito:", consejo);
}

run().catch((err) => {
  console.error("Error en la ejecución:", err.message);
  process.exit(1);
});
