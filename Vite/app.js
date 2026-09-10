const btnUpdate = document.getElementById("btn-update");
const btnDetect = document.getElementById("btn-detect-models");
const apiKeyInput = document.getElementById("api-key");
const modelSelect = document.getElementById("model-select");

// Cargar datos previos de localStorage
if (localStorage.getItem("gemini_key")) {
  apiKeyInput.value = localStorage.getItem("gemini_key");
}
if (localStorage.getItem("gemini_selected_model")) {
  modelSelect.value = localStorage.getItem("gemini_selected_model");
}

modelSelect.addEventListener("change", () => {
  localStorage.setItem("gemini_selected_model", modelSelect.value);
});

// Obtiene coordenadas reales del usuario o usa Madrid por defecto
function getCoordinates() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 40.4168, lon: -3.7038, city: "Madrid" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: "Tu ubicación" }),
      () => resolve({ lat: 40.4168, lon: -3.7038, city: "Madrid" }),
      { timeout: 5000 }
    );
  });
}

// Autodetección de modelos soportados por tu clave
btnDetect.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) return alert("Pega tu API Key primero para consultar los modelos.");

  btnDetect.innerText = "⏳";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error("No se pudo obtener la lista de modelos. Clave inválida o sin permisos.");
    const data = await res.json();

    const generateModels = data.models
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    if (generateModels.length === 0) throw new Error("No se encontraron modelos de generación de texto.");

    modelSelect.innerHTML = generateModels.map(m => `<option value="${m}">${m}</option>`).join("");
    localStorage.setItem("gemini_selected_model", modelSelect.value);
    alert(`Modelos detectados con éxito (${generateModels.length} disponibles).`);
  } catch (err) {
    alert(err.message);
  } finally {
    btnDetect.innerText = "🔍";
  }
});

// Consulta meteorológica y generación de informe
btnUpdate.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const selectedModel = modelSelect.value;

  if (!apiKey) return alert("Introduce tu Gemini API Key");
  localStorage.setItem("gemini_key", apiKey);

  btnUpdate.innerText = "Consultando...";
  btnUpdate.disabled = true;

  try {
    // 1. Obtener coordenadas
    const coords = await getCoordinates();
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&current_weather=true&timezone=auto`;

    // 2. Obtener datos meteorológicos de Open-Meteo
    const weatherRes = await fetch(apiUrl);
    if (!weatherRes.ok) throw new Error("Fallo al conectar con Open-Meteo");
    const weatherData = await weatherRes.json();

    document.getElementById("city-title").innerText = coords.city;

    // 3. Formatear el prompt
    const promptText = `Analiza estos datos meteorológicos de hoy en ${coords.city}:
- Temp actual: ${weatherData.current_weather.temperature}°C
- Máx/Mín: ${weatherData.daily.temperature_2m_max[0]}°C / ${weatherData.daily.temperature_2m_min[0]}°C
- Prob. lluvia: ${weatherData.daily.precipitation_probability_max[0]}%
- UV máx: ${weatherData.daily.uv_index_max[0]}
- Viento: ${weatherData.current_weather.windspeed} km/h

Responde ÚNICAMENTE un JSON válido con esta estructura:
{
  "consejo": "Consejo directo de ropa y precauciones (máx 15 palabras)",
  "que_llevar": ["Prenda 1", "Accesorio 2", "Accesorio 3"],
  "paleta_luz": ["#4A5568", "#CBD5E1", "#D97706"]
}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      throw new Error(`Error API (${geminiRes.status}): ${errData.error?.message || "Fallo en Gemini"}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates[0].content.parts[0].text;
    const cleanJson = JSON.parse(rawText.replace(/```json|```/gi, "").trim());

    // 4. Renderizado en interfaz
    document.getElementById("temp-display").innerText = `${weatherData.current_weather.temperature}°C`;
    document.getElementById("alert-text").innerText = cleanJson.consejo;

    const list = document.getElementById("items-list");
    list.innerHTML = cleanJson.que_llevar.map(item => `<li>${item}</li>`).join("");

    const palette = document.getElementById("palette-container");
    palette.innerHTML = cleanJson.paleta_luz.map(hex => `<div class="swatch" style="background:${hex}">${hex}</div>`).join("");

  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    btnUpdate.innerText = "Actualizar reporte";
    btnUpdate.disabled = false;
  }
});
