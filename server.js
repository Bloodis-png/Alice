const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
app.use(cors());

// Servir los estáticos temporalmente para que render te muestre el frontend
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const openaiAPI = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

let loopIniciativa = null; // Temporizador global
let socketsConectados = 0;

io.on('connection', (socket) => {
    socketsConectados++;
    console.log(`Deriell conectado. Total: ${socketsConectados}`);

    // --- COMANDOS PASIVOS (RESPONDER) ---
    socket.on('mensaje_voz', async (data) => {
        try {
            if (!openaiAPI) {
                 socket.emit('respuesta_alice', { texto: `(Local) Comando: ${data.texto}`, pose: "alice-hablando" });
                 return;
            }
            const completion = await openaiAPI.chat.completions.create({
                model: "gpt-4-turbo", // Ajuste del modelo a gpt-4-turbo o el que uses
                messages: [
                    { role: "system", content: process.env.ALICE_SYSTEM_PROMPT || "Eres Alice, una IA concisa y profesional." },
                    { role: "user", content: data.texto }
                ],
            });
            const respuestaTexto = completion.choices[0].message.content;
            socket.emit('respuesta_alice', { texto: respuestaTexto, pose: "alice-hablando" });
        } catch (error) {
            socket.emit('respuesta_alice', { texto: "Error en el núcleo de la IA.", pose: "alice-frustrada" });
        }
    });

    // --- ACTIVAR MODO VIVO ---
    socket.on('activar_modo_vivo', () => {
        console.log("Activando Modo Vivo por petición de Deriell.");
        if (loopIniciativa) clearInterval(loopIniciativa); // Limpiar si ya existía

        loopIniciativa = setInterval(async () => {
            if (socketsConectados > 0) {
                try {
                    console.log("Generando iniciativa proactiva...");
                    if (!openaiAPI) {
                        io.emit('iniciativa_alice', { texto: "[MODO LOCAL] Interrupción proactiva local (fake).", pose: "alice-hablando" });
                        return;
                    }
                    const completion = await openaiAPI.chat.completions.create({
                        model: "gpt-4-turbo",
                        messages: [
                            { role: "system", content: process.env.ALICE_SYSTEM_PROMPT || "Eres Alice, una IA concisa y profesional." },
                            // Instrucción proactiva estricta
                            { role: "user", content: "[ALICE_INITIATIVE_PROTOCOL] Deriell está en stream. Lanza un tema de conversación interesante o una noticia breve sobre MMOs o Crimson Desert para que él pueda comentarla. Sé breve, profesional y tecnológica." }
                        ],
                    });
                    const tema = completion.choices[0].message.content;
                    // Emitir a TODOS los sockets conectados
                    io.emit('iniciativa_alice', { texto: tema, pose: "alice-hablando" });
                } catch (error) {
                    console.log("Error en loop de iniciativa.", error);
                }
            }
        }, 60000); // 1 minuto
    });

    // --- DESACTIVAR MODO VIVO ---
    socket.on('desactivar_modo_vivo', () => {
        console.log("Desactivando Modo Vivo. Alice en reposo.");
        if (loopIniciativa) clearInterval(loopIniciativa);
        loopIniciativa = null;
    });

    socket.on('disconnect', () => {
        socketsConectados--;
        console.log(`Deriell desconectado. Total: ${socketsConectados}`);
        // Si no hay nadie conectado, parar el loop por seguridad
        if (socketsConectados === 0 && loopIniciativa) {
            clearInterval(loopIniciativa);
            loopIniciativa = null;
        }
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Cerebro operativo en puerto ${PORT}`));
