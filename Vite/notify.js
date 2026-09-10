const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NTFY_TOPIC = process.env.NTFY_TOPIC;

// Coordenadas de Madrid (ajustables según necesidad)
const LAT = 40.4168;
const LON = -3.7038;

async function run() {
  try {
    // 1. Obtener métricas meteorológicas de Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&current_weather=true&timezone=auto`;
    const wRes = await fetch(weatherUrl);
    if (!wRes.ok) throw new Error("Fallo al consultar Open-Meteo");
    const wData = await wRes.json();

    const currentTemp = wData.current_weather.temperature;
    const rainProb = wData.daily.precipitation_probability_max[0];
    const uvMax = wData.daily.uv_index_max[0];
    const wind = wData.current_weather.windspeed;

    // 2. Generar consejo con Gemini Flash
    const prompt = `Analiza estos datos meteorológicos en Madrid:
- Temperatura actual: ${currentTemp}°C
- Probabilidad de lluvia: ${rainProb}%
- Índice UV: ${uvMax}
- Viento: ${wind} km/h

Devuelve EXACTAMENTE una frase directa de máximo 85 caracteres para una notificación matutina móvil diciendo qué ponerse o qué llevar hoy (ej: abrigo fino, paraguas, gafas). Sé concisa, práctica y sin rodeos. Sin comillas ni texto adicional.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const gRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!gRes.ok) {
      const err = await gRes.text();
      throw new Error(`Error en Gemini: ${err}`);
    }

    const gData = await gRes.json();
    const consejo = gData.candidates[0].content.parts[0].text.trim();

    // 3. Enviar notificación push mediante ntfy.sh
    const pushRes = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      body: consejo,
      headers: {
        "Title": `Madrid ${currentTemp}°C — Briefing de hoy`,
        "Priority": "high",
        "Tags": "partly_sunny"
      }
    });

    if (!pushRes.ok) throw new Error("Fallo al enviar la notificación a ntfy");

    console.log("Notificación enviada correctamente:", consejo);
  } catch (err) {
    console.error("Error en la ejecución:", err.message);
    process.exit(1);
  }
}

run();
