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

    // Feedback Visual: Haz que el botón del micrófono cambie de color o brille mientras Alice esté 'escuchando'
    recognition.onstart = () => {
        isRecording = true;
        botonMicrofono.style.backgroundColor = '#e11d48'; // Rojo carmesí
        botonMicrofono.style.boxShadow = '0 0 15px #e11d48';
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
    botonMicrofono.style.boxShadow = '';
    inputComando.placeholder = "Escribe un comando o envía voz...";
}

// ====== FASE 3A: SOCKET.IO & CEREBRO (RENDER) ======
// URL: [PEGA AQUÍ TU URL DE RENDER]
const SERVER_URL = 'http://localhost:8080'; // Cambia esto por ej: 'https://mi-backend-alice.onrender.com'
const socket = io(SERVER_URL);

socket.on('connect', () => {
    console.log('Enlace con Alice establecido');
    agregarMensajeChat("A", "Enlace con Alice establecido.", "msg-alice");
    cambiarPoseAlice('alice-reposo');
});

socket.on('disconnect', () => {
    console.log("Desconectado de Alice");
});

// Recepción de Respuesta (La Voz de Alice): Crea un escuchador para el evento respuesta_alice
socket.on('respuesta_alice', (data) => {
    // Añade el texto al contenedor #historial-chat
    if (data.texto) {
        agregarMensajeChat("A", data.texto, "msg-alice");
    }

    // Cambia la clase del elemento #sprite-alice a la pose recibida
    if (data.pose) {
        cambiarPoseAlice(data.pose);
    }
});

function enviarMensajeAlServidor(texto) {
    if (!texto.trim()) return;

    // Mostrar el mensaje en el input del chat
    agregarMensajeChat("U", texto, "msg-user");
    inputComando.value = '';

    // Enviar evento socket 'mensaje_voz'
    if (socket && socket.connected) {
        cambiarPoseAlice('alice-pensativa');
        socket.emit('mensaje_voz', { mensaje: texto });
    } else {
        agregarMensajeChat("A", "[MODO OFFLINE] Servidor no detectado. Revisa que Socket.io esté en línea.", "msg-alice");
        cambiarPoseAlice('alice-frustrada');
    }
}

// ====== FASE 2: GESTIÓN DEL SPRITE (NOVELA VISUAL) ======
// Diccionario de imágenes (que ahora están en tu carpeta assets)
const poseSources = {
    'alice-reposo': 'assets/alice_reposo.png',
    'alice-hablando': 'assets/alice_hablando.png',
    'alice-pensativa': 'assets/alice_pensativa.png',
    'alice-alerta': 'assets/alice_alerta.png',
    'alice-frustrada': 'assets/alice_frustrada.png'
};

function cambiarPoseAlice(nuevaClase) {
    if (!spriteAlice) return;

    // Inyectamos un fade-out corto
    spriteAlice.style.opacity = '0';
    
    setTimeout(() => {
        // En la mitad de la transición de opacidad (CSS dicta 0.3s -> 150ms es la mitad)
        if (poseSources[nuevaClase]) {
            spriteAlice.src = poseSources[nuevaClase];
        }
        spriteAlice.className = nuevaClase;
        spriteAlice.style.opacity = '1';
    }, 150);

    // Tras 5 segundos de silencio, devuelve a Alice a la clase .alice-reposo automáticamente.
    if (nuevaClase !== 'alice-reposo') {
        clearTimeout(window.alicePoseTimeout);
        window.alicePoseTimeout = setTimeout(() => {
            cambiarPoseAlice('alice-reposo');
        }, 5000);
    }
}

function agregarMensajeChat(avatar, texto, tipo) {
    if (!historialChat) return;

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
