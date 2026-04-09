// ====== FASE 3A: INTEGRACIÓN WEBSPEECH API ======
const botonMicrofono = document.getElementById('boton-microfono');
const inputComando = document.getElementById('input-comando');
const historialChat = document.getElementById('historial-chat');
const spriteAlice = document.getElementById('sprite-alice');

// Configuramos la API de reconocimiento de voz
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        isRecording = true;
        botonMicrofono.style.backgroundColor = '#e11d48'; // Rojo para indicar que escucha
        inputComando.placeholder = "Escuchando voz...";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        inputComando.value = transcript;
        enviarMensajeAlServidor(transcript);
    };

    recognition.onerror = (event) => {
        console.error("Error en Speech API: ", event.error);
        restaurarMicrofono();
    };

    recognition.onend = () => {
        restaurarMicrofono();
    };
} else {
    console.warn("Speech API no soportada en este navegador.");
    botonMicrofono.title = "No soportado en este navegador";
}

botonMicrofono.addEventListener('click', () => {
    if (!recognition) return;
    if (!isRecording) {
        recognition.start();
    } else {
        recognition.stop();
    }
});

inputComando.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && inputComando.value.trim() !== '') {
        enviarMensajeAlServidor(inputComando.value);
    }
});

function restaurarMicrofono() {
    isRecording = false;
    botonMicrofono.style.backgroundColor = '';
    inputComando.placeholder = "Escribe un comando o envía voz...";
}

// ====== FASE 3A: WEBSOCKET & CEREBRO (RENDER) ======
// Cambia esto por la URL de tu servidor Render cuando lo despliegues
// Ejemplo: wss://tu-backend-alice.onrender.com
const WS_URL = 'ws://localhost:8080';
let socket;

function conectarWebSocket() {
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        console.log("Conectado al servidor de Alice.");
        agregarMensajeChat("A", "Conexión con núcleo Render establecida.", "msg-alice");
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Fase 3A (Boca): Mostrar respuesta
        if (data.texto) {
            agregarMensajeChat("A", data.texto, "msg-alice");
        }

        // Fase 3A / Fase 2 (El Cuerpo): Actualizar clase CSS de Sprite Alice
        if (data.pose) {
            cambiarPoseAlice(data.pose);
        }
    };

    socket.onclose = () => {
        console.log("Desconectado. Reintentando...");
        setTimeout(conectarWebSocket, 5000); // Reintento automático
    };
    
    socket.onerror = (err) => {
        console.warn("WebSocket no disponible por el momento. (Asegúrate de arrancar tu server.js)", err);
    }
}

conectarWebSocket();

function enviarMensajeAlServidor(texto) {
    if (!texto.trim()) return;

    // Mostrar el mensaje en UI
    agregarMensajeChat("U", texto, "msg-user");
    inputComando.value = '';

    // Enviar data
    if (socket && socket.readyState === WebSocket.OPEN) {
        // Al enviar comando, que Alice luzca pensativa temporalmente
        cambiarPoseAlice('alice-pensativa');
        socket.send(JSON.stringify({ mensaje: texto }));
    } else {
        // En caso de que no haya server, simulamos offline
        agregarMensajeChat("A", "[MODO OFFLINE] Sistema desconectado del backend central.", "msg-alice");
        cambiarPoseAlice('alice-frustrada');
    }
}

// ====== FASE 2: GESTIÓN DEL SPRITE (NOVELA VISUAL) ======
function cambiarPoseAlice(nuevaClase) {
    if(!spriteAlice) return;

    // Array de posibles poses (Fase 2)
    const clasesPosibles = [
        'alice-reposo', 
        'alice-hablando', 
        'alice-pensativa', 
        'alice-alerta', 
        'alice-frustrada'
    ];
    
    spriteAlice.classList.remove(...clasesPosibles);
    spriteAlice.classList.add(nuevaClase);

    // Animación de retorno a la normalidad si es necesario (ej: tras 8 segundos)
    if (nuevaClase !== 'alice-reposo') {
        clearTimeout(window.alicePoseTimeout);
        window.alicePoseTimeout = setTimeout(() => {
            spriteAlice.classList.remove(...clasesPosibles);
            spriteAlice.classList.add('alice-reposo');
        }, 8000);
    }
}

function agregarMensajeChat(avatar, texto, tipo) {
    if(!historialChat) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${tipo}`;
    
    if (tipo === 'msg-alice') {
        msgDiv.innerHTML = `
            <div class="avatar avatar-alice">${avatar}</div>
            <div class="msg-bubble"><p>${texto}</p></div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="msg-bubble"><p>${texto}</p></div>
            <div class="avatar avatar-user">${avatar}</div>
        `;
    }

    historialChat.appendChild(msgDiv);
    historialChat.scrollTop = historialChat.scrollHeight;
}
