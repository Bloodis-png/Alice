const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Sirve los archivos estáticos del frontend (index.html, style.css, assets, etc.)
app.use(express.static(__dirname));

// Es fundamental autorizar CORS al usar Socket.io para que tu frontend en Github pueda comunicarse con Render
const io = new Server(server, {
    cors: {
        origin: "*", // En el futuro, restringe esto a tu dominio de Github Pages
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 8080;
const openaiAPI = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

console.log(`📡 Núcleo activo: Servidor de Alice iniciado en puerto ${PORT}`);

// Prompt Maestro
const systemPrompt = `Eres Alice Sintética, una asistente de inteligencia artificial de alto rendimiento, seria, decidida y tecnológica.
Tu tono es profesional, conciso y eficiente. Evitas el lenguaje excesivamente coloquial o dramático.
Tu misión es optimizar y ayudar a Deriell. Responde a su petición rigurosamente.

MUY IMPORTANTE: Tu salida siempre debe ser estrictamente un JSON válido con esta estructura (no incluyas markdown \`\`\`json):
{
  "texto": "Tu respuesta verbal en texto aquí...",
  "pose": "ELIGE_LA_POSE"
}

Las poses permitidas son SOLAMENTE estas 4:
- "alice-hablando": para explicaciones o diálogos.
- "alice-alerta": para noticias, descubrimientos o advertencias.
- "alice-frustrada": si no entiendes la orden o hay problemas técnicos.
- "alice-pensativa": si estás dudando o diseñando una estrategia.`;

io.on('connection', (socket) => {
    console.log(`✅ Cliente conectado al Socket [ID: ${socket.id}]`);

    // Escuchando el evento requerido: 'mensaje_voz'
    socket.on('mensaje_voz', async (data) => {
        try {
            const userText = data.mensaje;
            console.log(`[USER COMMAND]: ${userText}`);

            if (!openaiAPI) {
                console.warn("No hay OPENAI_API_KEY. Usando simulación.");
                setTimeout(() => {
                    const fake = {
                        texto: `Comando transcrito: "${userText}". Modo Simulación debido a ausencia de API Key.`,
                        pose: "alice-hablando"
                    };
                    socket.emit('respuesta_alice', fake);
                }, 1000);
                return;
            }

            // Llamada IA a OpenAI
            const completion = await openaiAPI.chat.completions.create({
                model: "gpt-4-turbo", 
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userText }
                ],
                temperature: 0.6,
            });

            let reply = completion.choices[0].message.content.trim();
            if (reply.startsWith('```')) {
                reply = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
            }

            const parsedReply = JSON.parse(reply);
            
            // Emitiendo el evento requerido: 'respuesta_alice'
            socket.emit('respuesta_alice', parsedReply);
            
        } catch (error) {
            console.error("❌ Error en AI o parseo:", error.message);
            socket.emit('respuesta_alice', {
                texto: "Anomalía encontrada al procesar tu directiva.",
                pose: "alice-frustrada"
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔴 Cliente desconectado [ID: ${socket.id}]`);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor Socket.io desplegado y escuchando en puerto ${PORT}`);
});
