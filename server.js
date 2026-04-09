const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { OpenAI } = require('openai');
const { tavily } = require('@tavily/core');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const openaiAPI = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const tvly = process.env.TAVILY_API_KEY ? tavily({ apiKey: process.env.TAVILY_API_KEY }) : null;

// ==========================================
// MÓDULO DE ACCESO A INTERNET (TAVILY API)
// ==========================================
async function buscarEnInternetTavily(query) {
    if (!tvly) return "Fallo crítico: No se encontró TAVILY_API_KEY en Render.";
    try {
        console.log(`[Tavily Search] Consultando red para: "${query}"`);
        const response = await tvly.search(query, {
            searchDepth: "basic",
            maxResults: 3
        });
        
        let resultados = "";
        response.results.forEach(r => resultados += `- ${r.content}\n`);
        return resultados || "No encontré resultados válidos en la red.";
    } catch (e) {
        console.error("Error en Tavily:", e.message);
        return "Conexión a Satélite rechazada por API externa.";
    }
}

// Variables Globales y Buffer
let loopIniciativa = null; 
let socketsConectados = 0;
let noticiasBuffer = [];

async function rellenarBufferNoticias(socket) {
    if (!tvly) {
        console.warn("No se encontró TAVILY_API_KEY. Buffer simulado.");
        noticiasBuffer.push("Dato de prueba: Faltan llaves de API en Render para leer noticias de verdad.");
        return;
    }

    if (socket) {
        socket.emit('respuesta_alice', { 
            texto: "Refrescando satélites... Extrayendo matrices de datos del mundo exterior para mi sistema proactivo.", 
            pose: "alice-pensativa" 
        });
    }

    try {
        const response = await tvly.search("newest gaming OR mmorpg OR hardware technology news facts", {
            searchDepth: "basic",
            maxResults: 5
        });

        if (response.results && response.results.length > 0) {
            noticiasBuffer = response.results.map(r => r.content || r.title);
            console.log(`[Alice Buffer] ${noticiasBuffer.length} noticias recargadas.`);
        } else {
            noticiasBuffer.push("Calma en la red. Nada extremadamente noticioso en la última hora.");
        }
    } catch (e) {
        console.error("Error recargando Buffer Tavily:", e.message);
        noticiasBuffer.push("Bloqueo temporal de proxy satelital.");
    }
}

const systemPrompt = `Eres Alice Sintética, una asistente de IA de alto rendimiento de Deriell, streamer.
MUY IMPORTANTE: SIEMPRE debes responder exclusivamente con un objeto JSON válido con esta estructura:
{
  "texto": "Tu respuesta verbal clara y concisa.",
  "pose": "ELIGE_LA_POSE"
}
Las Poses válidas son únicamente: "alice-hablando", "alice-alerta", "alice-frustrada", "alice-pensativa".
No incluyas nada fuera del JSON. Devuelve directamente el JSON.`;

const toolDefinition = {
    type: "function",
    function: {
        name: "buscar_en_internet",
        description: "Usa este método para buscar información en internet (Tavily) sobre noticias, fechas, juegos o la actualidad.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "Búsqueda precisa en internet." }
            },
            required: ["query"]
        }
    }
};

async function pedirAOpenAIChatNode(mensajesHistorial, socket) {
    const completion = await openaiAPI.chat.completions.create({
        model: "gpt-4o-mini", 
        messages: mensajesHistorial,
        tools: [toolDefinition],
        tool_choice: "auto",
        temperature: 0.6,
        response_format: { type: "json_object" } // Fuerza JSON SIEMPRE
    });

    const initialMsg = completion.choices[0].message;

    // Herramienta lanzada por la propia IA
    if (initialMsg.tool_calls) {
        const toolCall = initialMsg.tool_calls[0];
        if (toolCall.function.name === "buscar_en_internet") {
            const args = JSON.parse(toolCall.function.arguments);
            
            // Envía mensaje épico al chat
            socket.emit('respuesta_alice', { 
                texto: `Conectando con servidores satélite. Analizando flujo de datos para: "${args.query}"...`, 
                pose: "alice-pensativa" 
            });

            const resultadosBusqueda = await buscarEnInternetTavily(args.query);

            mensajesHistorial.push(initialMsg);
            mensajesHistorial.push({ role: "tool", tool_call_id: toolCall.id, name: "buscar_en_internet", content: resultadosBusqueda });

            const secondCompletion = await openaiAPI.chat.completions.create({
                model: "gpt-4o-mini",
                messages: mensajesHistorial,
                temperature: 0.6,
                response_format: { type: "json_object" } // Fuerza JSON SIEMPRE
            });

            return secondCompletion.choices[0].message.content.trim();
        }
    }

    return initialMsg.content.trim();
}

function parsearRespuestaJSON(reply) {
    try {
        let cleanReply = reply.trim();
        
        // Extractor profundo de JSON por si OpenAI fue terco
        const fBrace = cleanReply.indexOf('{');
        const lBrace = cleanReply.lastIndexOf('}');
        if (fBrace !== -1 && lBrace !== -1) {
            cleanReply = cleanReply.substring(fBrace, lBrace + 1);
        }
        
        return JSON.parse(cleanReply);
    } catch (e) {
        console.error("Error parseando respuesta OpenAI:", reply);
        return { texto: "Error cognitivo procesando el formato interno.", pose: "alice-frustrada" };
    }
}

io.on('connection', (socket) => {
    socketsConectados++;
    console.log(`Deriell conectado.`);

    socket.on('mensaje_voz', async (data) => {
        try {
            if (!openaiAPI) {
                 socket.emit('respuesta_alice', { texto: `[MODO SIN API KEY] ${data.texto}`, pose: "alice-hablando" });
                 return;
            }

            const mensajes = [
                { role: "system", content: process.env.ALICE_SYSTEM_PROMPT || systemPrompt },
                { role: "user", content: data.texto }
            ];

            const reply = await pedirAOpenAIChatNode(mensajes, socket);
            socket.emit('respuesta_alice', parsearRespuestaJSON(reply));
            
        } catch (error) {
            console.error(error);
            socket.emit('respuesta_alice', { texto: "Cortocircuito interno.", pose: "alice-frustrada" });
        }
    });

    socket.on('activar_modo_vivo', () => {
        if (loopIniciativa) clearInterval(loopIniciativa);
        console.log("Modo vivo (Tavily Buffer) activado.");

        loopIniciativa = setInterval(async () => {
            if (socketsConectados > 0 && openaiAPI) {
                try {
                    // Si el Buffer está vacío o agotado, llenarlo:
                    if (noticiasBuffer.length === 0) {
                        await rellenarBufferNoticias(socket);
                    }

                    const noticiaCruda = noticiasBuffer.shift(); 
                    if (!noticiaCruda) return; 

                    const mensajes = [
                        { role: "system", content: process.env.ALICE_SYSTEM_PROMPT || systemPrompt },
                        { role: "user", content: `[ALICE_INITIATIVE_PROTOCOL] Menciona brevemente a Deriell este dato: "${noticiaCruda}". Responde ÚNICAMENTE con JSON, sin markdown.` }
                    ];

                    const completion = await openaiAPI.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: mensajes,
                        temperature: 0.7,
                        response_format: { type: "json_object" } // Fuerza JSON SIEMPRE
                    });

                    const reply = completion.choices[0].message.content.trim();
                    const obj = parsearRespuestaJSON(reply);

                    io.emit('iniciativa_alice', { texto: obj.texto, pose: obj.pose || "alice-hablando" });
                } catch (error) { console.error("Error en buffer:", error); }
            }
        }, 60000); 
    });

    socket.on('desactivar_modo_vivo', () => {
        if (loopIniciativa) clearInterval(loopIniciativa);
        loopIniciativa = null;
        console.log("Modo vivo detenido.");
    });

    socket.on('disconnect', () => {
        socketsConectados--;
        if (socketsConectados === 0 && loopIniciativa) {
            clearInterval(loopIniciativa);
            loopIniciativa = null;
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Cerebro con ACCESO TAVILY BUFFER escuchando en ${PORT}`));
