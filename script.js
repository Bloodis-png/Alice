// ====== FASE 3A & MODO VIVO: INTEGRACIÓN CON WEBSPEECH API ======
const botonMicrofono = document.getElementById('boton-microfono');
const inputComando = document.getElementById('input-comando');
const historialChat = document.getElementById('historial-chat');
const spriteAlice = document.getElementById('sprite-alice');
const modoVivoProgress = document.getElementById('modo-vivo-progress');
const progressBarFill = modoVivoProgress ? modoVivoProgress.querySelector('.progress-bar-fill') : null;

// Audio context para notificaciones
function playSystemBeep() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Tono agradable (A5)
    oscillator.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); 
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.05); // Volumen muy bajo y elegante
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.3);
}

// Variables Globales
let progressInterval = null;
let secondsModoVivo = 0;

// API de voz
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
        botonMicrofono.style.backgroundColor = '#e11d48'; 
        botonMicrofono.style.boxShadow = '0 0 15px #e11d48';
        inputComando.placeholder = "Escuchando voz...";
    };

    recognition.onresult = (event) => {
        const transcriptRaw = event.results[0][0].transcript;
        enviarMensajeAlServidor(transcriptRaw);
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

// ====== MODOS Y TEMPORIZADORES DE ALICE ======
function activarModoVivo() {
    agregarMensajeChat("SISTEMA", "[SISTEMA] Modo Vivo activado. Alice tiene iniciativa.", "msg-alice");
    socket.emit('activar_modo_vivo');
    
    if (modoVivoProgress) modoVivoProgress.style.display = 'block';
    resetProgressTimer();
}

function desactivarModoVivo() {
    agregarMensajeChat("SISTEMA", "[SISTEMA] Modo Vivo desactivado. Alice en reposo.", "msg-alice");
    socket.emit('desactivar_modo_vivo');
    
    if (modoVivoProgress) modoVivoProgress.style.display = 'none';
    if(progressInterval) clearInterval(progressInterval);
}

function resetProgressTimer() {
    secondsModoVivo = 0;
    if (progressBarFill) progressBarFill.style.width = '0%';
    
    if(progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        secondsModoVivo++;
        if (progressBarFill) progressBarFill.style.width = `${(secondsModoVivo / 60) * 100}%`;
        
        if (secondsModoVivo >= 60) {
            secondsModoVivo = 0;
            if (progressBarFill) progressBarFill.style.width = '0%';
        }
    }, 1000); 
}

// ====== SOCKET.IO (RENDER) ======
const SERVER_URL = window.location.origin; 
const socket = io(SERVER_URL);

socket.on('connect', () => {
    console.log('Enlace con Alice establecido');
    agregarMensajeChat("A", "Sistemas operativos. Enlace con Alice verificado. Esperando órdenes de Deriell.", "msg-alice");
    cambiarPoseAlice('alice-reposo');
});

socket.on('disconnect', () => {
    console.log("Desconectado de Alice");
});

socket.on('respuesta_alice', (data) => {
    if (data.texto) agregarMensajeChat("A", data.texto, "msg-alice");
    if (data.pose) cambiarPoseAlice(data.pose);
});

// EVENTO DE INICIATIVA PROACTIVA
socket.on('iniciativa_alice', (data) => {
    playSystemBeep();

    // Resetear timer visual para que arranque otros 60s
    if (modoVivoProgress && modoVivoProgress.style.display === 'block') {
        resetProgressTimer();
    }

    if (data.texto) {
        agregarMensajeChat("A", `[ALICE INTUYE] ${data.texto}`, "msg-alice");
    }

    if (data.pose) {
        // Transición de Alerta -> Hablando (según el prompt)
        cambiarPoseAlice('alice-alerta');
        setTimeout(() => {
            cambiarPoseAlice('alice-hablando');
        }, 1500); 
    }
});

function enviarMensajeAlServidor(textoOriginal) {
    if (!textoOriginal.trim()) return;

    agregarMensajeChat("U", textoOriginal, "msg-user");
    inputComando.value = '';

    const textoBajo = textoOriginal.toLowerCase();

    // === INTERCEPTAR COMANDOS (Escrito y Voz) ===
    if (textoBajo.includes('modo vivo') || textoBajo.includes('modo viva')) {
        activarModoVivo();
        return;
    }
    
    if (textoBajo.includes('dormir') || textoBajo.includes('reposo')) {
        desactivarModoVivo();
        return;
    }

    if (socket && socket.connected) {
        cambiarPoseAlice('alice-pensativa');
        socket.emit('mensaje_voz', { texto: textoOriginal });
    } else {
        agregarMensajeChat("A", "[MODO OFFLINE] Servidor no detectado. Revisa que Socket.io esté en línea.", "msg-alice");
        cambiarPoseAlice('alice-frustrada');
    }
}

// ====== FASE 2: GESTIÓN DEL SPRITE Y UI ======
const poseSources = {
    'alice-reposo': 'assets/alice_reposo.png',
    'alice-hablando': 'assets/alice_hablando.png',
    'alice-pensativa': 'assets/alice_pensativa.png',
    'alice-alerta': 'assets/alice_alerta.png',
    'alice-frustrada': 'assets/alice_frustrada.png'
};

function cambiarPoseAlice(nuevaClase) {
    if (!spriteAlice) return;

    spriteAlice.style.opacity = '0';
    
    setTimeout(() => {
        if (poseSources[nuevaClase]) {
            spriteAlice.src = poseSources[nuevaClase];
        }
        spriteAlice.className = nuevaClase;
        spriteAlice.style.opacity = '1';
    }, 150);

    // Retorno automático a reposo tras 8s de silencio
    if (nuevaClase !== 'alice-reposo') {
        clearTimeout(window.alicePoseTimeout);
        window.alicePoseTimeout = setTimeout(() => {
            cambiarPoseAlice('alice-reposo');
        }, 8000);
    }
}

// Efecto máquina de escribir (Typewriter)
function typeWriterEffect(element, text, speed = 30) {
    let i = 0;
    element.innerHTML = '';
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            historialChat.scrollTop = historialChat.scrollHeight;
            setTimeout(type, speed);
        }
    }
    type();
}

function agregarMensajeChat(avatar, texto, tipo) {
    if (!historialChat) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${tipo}`;
    
    if (tipo === 'msg-alice') {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar avatar-alice';
        avatarDiv.innerText = avatar;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'msg-bubble';
        const p = document.createElement('p');
        
        bubbleDiv.appendChild(p);
        msgDiv.appendChild(avatarDiv);
        msgDiv.appendChild(bubbleDiv);
        
        historialChat.appendChild(msgDiv);
        
        typeWriterEffect(p, texto);
    } else {
        msgDiv.innerHTML = `
            <div class="msg-bubble"><p>${texto}</p></div>
            <div class="avatar avatar-user">${avatar}</div>
        `;
        historialChat.appendChild(msgDiv);
        historialChat.scrollTop = historialChat.scrollHeight;
    }
}
