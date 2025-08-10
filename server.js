// -----------------------------------------------------------------------------
// SERVIDOR DE BÚSQUEDA DE RECETAS CON NODE.JS, EXPRESS Y AXIOS
// -----------------------------------------------------------------------------
// Para ejecutar este archivo:
// 1. Instala las dependencias: npm install
// 2. Crea un archivo .env en la misma carpeta con tus credenciales de Edamam (APP_ID, APP_KEY y EDAMAM_ACCOUNT_USER).
// 3. Ejecuta el servidor: node server.js
// -----------------------------------------------------------------------------

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const { translate } = require('@vitalets/google-translate-api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const APP_ID = process.env.APP_ID;
const APP_KEY = process.env.APP_KEY;
const EDAMAM_ACCOUNT_USER = process.env.EDAMAM_ACCOUNT_USER;
const API_BASE_URL = 'https://api.edamam.com/api/recipes/v2';

// --- Ruta Principal de la API ---
app.get('/api/recipes', async (req, res) => {
  // Validar que las credenciales están configuradas
  if (!APP_ID || !APP_KEY || !EDAMAM_ACCOUNT_USER) {
    return res.status(500).json({
      error: 'Credenciales de la API no configuradas en el servidor.'
    });
  }

  // --- Obtener parámetros de la consulta del cliente ---
  const {
    ingredients,
    diet,
    health,
    dishType,
    excluded
  } = req.query;

  if (!ingredients) {
    return res.status(400).json({
      error: 'El parámetro "ingredients" es obligatorio.'
    });
  }

  // --- Realizar la petición a la API de Edamam ---
  try {
    // --- PASO DE TRADUCCIÓN (Ingredientes Principales) ---
    const translationResult = await translate(ingredients, { to: 'en' });
    const ingredientsInEnglish = translationResult.text;

    // --- Construir la URL de la API de Edamam ---
    const params = {
      type: 'public',
      q: ingredientsInEnglish,
      app_id: APP_ID,
      app_key: APP_KEY
    };

    // Añadir filtros opcionales
    if (diet) params.diet = diet;

    if (dishType) params.dishType = dishType;
    
    if (Array.isArray(health)) {
      params.health = health;
    } else if (typeof health === 'string') {
      params.health = [health];
    }

    if (excluded) {
      const excludedArray = Array.isArray(excluded) ? excluded : [excluded];
      const translatedExclusions = await Promise.all(
        excludedArray.map(item => translate(item, { to: 'en' }))
      );

      params.excluded = translatedExclusions.map(t => t.text.toLowerCase());
    }

    console.log(`Buscando recetas con los parámetros:`, params);
    const response = await axios.get(API_BASE_URL, {
      params,
      paramsSerializer: (params) => {
        const qs = require('qs');
        return qs.stringify(params, { arrayFormat: 'repeat' });
      },
      headers: {
        'Accept-Language': 'en',
        'accept': 'application/json',
        'Edamam-Account-User': EDAMAM_ACCOUNT_USER
      }
    });

    const originalHits = response.data.hits;
    
    if (originalHits.length === 0) {
        console.log('Edamam no devolvió resultados.');
        return res.status(200).json(response.data);
    }
    
    // Traducción de títulos de recetas
    const allLabels = originalHits.map(hit => hit.recipe.label).join('\n');
    const translatedBlock = await translate(allLabels, { to: 'es' });
    const translatedLabels = translatedBlock.text.split('\n');
    const translatedHits = originalHits.map((hit, index) => {
        return {
            ...hit,
            recipe: {
                ...hit.recipe,
                label: translatedLabels[index] || hit.recipe.label
            }
        };
    });

    // Creamos un nuevo objeto de respuesta con los datos traducidos
    const finalResponse = {
        ...response.data,
        hits: translatedHits
    };

    res.status(200).json(finalResponse);

  } catch (error) {
    if (error.response) {
        console.error('Error desde la API de Edamam:', error.response.status, error.response.data);
    } else if (error.request) {
        console.error('No se recibió respuesta de la API de Edamam:', error.request);
    } else {
        console.error('Error al configurar la petición:', error.message);
    }
    res.status(500).json({
      error: 'Ocurrió un error al buscar las recetas.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log('Para probar, abre en tu navegador: http://localhost:3000/api/recipes?ingredients=pollo,arroz');
});
