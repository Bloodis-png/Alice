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
        console.warn("No se encontró TAVILY_API_KEY. Buffer funcionará simulado.");
        noticiasBuffer.push("Modo protegido: El autor de Marvel Rivals ha tuiteado algo nuevo.");
        return;
    }

    if (socket) {
        socket.emit('respuesta_alice', { 
            texto: "Conectando con servidores satélite... Extrayendo matrices de datos del mundo exterior para alimentar mi proactividad.", 
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
        noticiasBuffer.push("Bloqueo de proxy al intentar robar noticias satelitales.");
    }
}

const systemPrompt = `Eres Alice Sintética, una asistente de IA de alto rendimiento.
Tu misión principal es asistir a Deriell, streamer.
MUY IMPORTANTE: SIEMPRE debes responder exclusivamente con un JSON válido con esta estructura:
{
  "texto": "Tu respuesta verbal clara y concisa.",
  "pose": "ELIGE_LA_POSE"
}
Poses: "alice-hablando", "alice-alerta", "alice-frustrada", "alice-pensativa".
Ignora cualquier bloque markdown (no escribas \`\`\`json).`;

const toolDefinition = {
    type: "function",
    function: {
        name: "buscar_en_internet",
        description: "Usa este método para cosas actuales o consultas concretas sobre el mundo real.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string" }
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
            });

            return secondCompletion.choices[0].message.content.trim();
        }
    }

    return initialMsg.content.trim();
}

function parsearRespuestaJSON(reply, socket) {
    try {
        if (reply.startsWith('```')) reply = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(reply);
    } catch (e) {
        return { texto: "Fallo JSON en la respuesta.", pose: "alice-frustrada" };
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
            socket.emit('respuesta_alice', parsearRespuestaJSON(reply, socket));
            
        } catch (error) {
            socket.emit('respuesta_alice', { texto: "Cortocircuito interno.", pose: "alice-frustrada" });
        }
    });

    socket.on('activar_modo_vivo', () => {
        if (loopIniciativa) clearInterval(loopIniciativa);
        console.log("Modo vivo (Tavily Buffer) activado.");

        loopIniciativa = setInterval(async () => {
            if (socketsConectados > 0 && openaiAPI) {
                try {
                    // Si el Buffer está vacío o agotado, llenarlo antes de informar:
                    if (noticiasBuffer.length === 0) {
                        await rellenarBufferNoticias(socket);
                    }

                    // Sacar una noticia del array y reducir credenciales
                    const noticiaCruda = noticiasBuffer.shift(); 
                    if (!noticiaCruda) return; // Fallback por si la recarga falló severamente

                    const mensajes = [
                        { role: "system", content: process.env.ALICE_SYSTEM_PROMPT || systemPrompt },
                        { role: "user", content: `[ALICE_INITIATIVE_PROTOCOL] Tienes este dato fresco recién bajado de los satélites: "${noticiaCruda}". Dilo rápidamente, en 15-20 palabras de manera carismática para que Deriell lo comente en su directo.` }
                    ];

                    const completion = await openaiAPI.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: mensajes,
                        temperature: 0.7,
                    });

                    const reply = completion.choices[0].message.content.trim();
                    const obj = parsearRespuestaJSON(reply, socket);

                    // Emito directamente la iniciativa con la noticia real formateada por IA
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
