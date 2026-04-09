// ====== FASE 3A: CEREBRO DE ALICE EN NODE.JS ======
const { WebSocketServer } = require('ws');
const { OpenAI } = require('openai');
require('dotenv').config();

// Servidor WebSocket (Funcionará en Render y localmente)
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
console.log(`📡 Núcleo activo: Servidor de Alice iniciado en puerto ${PORT}`);

// Instancia OpenAI - Se requiere configurar heroku/render env vars con OPENAI_API_KEY
const openaiAPI = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Prompt Maestro de Personalidad
const systemPrompt = `Eres Alice Sintética, una asistente de inteligencia artificial de alto rendimiento, seria, decidida y tecnológica.
Tu tono es profesional, conciso y eficiente. Evitas el lenguaje excesivamente coloquial o dramático.
Tu misión es optimizar y ayudar en las tareas y el stream de Deriell. Responde a su petición rigurosamente.

MUY IMPORTANTE: Tu salida siempre debe ser estrictamente un JSON válido con esta estructura (no incluyas bloques \`\`\`json ni markdown):
{
  "texto": "Tu respuesta verbal en texto aquí...",
  "pose": "ELIGE_LA_POSE"
}

Las poses permitidas son SOLAMENTE estas 4:
- "alice-hablando": para explicaciones normales o comunicación estándar.
- "alice-alerta": para reportar noticias importantes, urgencias o descubrimientos emocionantes.
- "alice-frustrada": si no entiendes la orden, Deriell comete un error, o hay un problema sintáctico.
- "alice-pensativa": si estás dudando o diseñando una estrategia/teoría muy densa.`;

wss.on('connection', (ws) => {
    console.log('✅ Cliente Antigravity conectado.');

    ws.on('message', async (messageBuffer) => {
        try {
            const data = JSON.parse(messageBuffer.toString());
            const userText = data.mensaje;
            console.log(`[USER COMMAND]: ${userText}`);

            // === Fallback si no hay API Key Configurada ===
            if (!openaiAPI) {
                console.warn("Advertencia: No se encontró OPENAI_API_KEY. Usando simulación automática.");
                setTimeout(() => {
                    const fake = {
                        texto: `Comando recibido: "${userText}". Confirmado, Deriell. Modo local activo sin motor semántico real.`,
                        pose: "alice-hablando"
                    };
                    ws.send(JSON.stringify(fake));
                }, 1000);
                return;
            }

            // === Petición Real al Motor AI (Fase 3A) ===
            const completion = await openaiAPI.chat.completions.create({
                model: "gpt-4-turbo", // o gpt-3.5-turbo según rentabilidad en Render
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userText }
                ],
                temperature: 0.6,
            });

            let reply = completion.choices[0].message.content.trim();
            
            // Limpieza robusta de la respuesta JSON por si el LLM incluye markdown (```json)
            if (reply.startsWith('```')) {
                reply = reply.replace(/```json/gi, '').replace(/```/g, '').trim();
            }

            // Enviamos de vuelta al cliente
            const parsedReply = JSON.parse(reply);
            ws.send(JSON.stringify(parsedReply));
            
        } catch (error) {
            console.error("❌ Error interno del servidor:", error.message);
            // Pose de frustración si falla el parseo o la conexión AI
            ws.send(JSON.stringify({
                texto: "Se rompió un nodo en mi cadena de procesamiento. Repite el comando.",
                pose: "alice-frustrada"
            }));
        }
    });

    ws.on('close', () => {
        console.log('🔴 Cliente Antigravity desconectado.');
    });
});
