// ============ 全局變數 ============
let camera;
let faceMesh;
let canvasElement;
let canvasCtx;
let videoElement;
let isRunning = false;
let lastFeedbackTime = 0;
const FEEDBACK_COOLDOWN = 3000; // 3秒冷卻時間，避免過於頻繁的反饋
let lastDetectedEmotion = null;

// 語音合成引擎
const synth = window.speechSynthesis;

// 表情配置
const emotionResponses = {
    'zh-TW': {
        happy: [
            "你今天看起來心情不錯喔！",
            "你的笑容很燦爛呢！",
            "保持開心的心情，繼續加油！",
            "你笑得真開心，真棒！",
            "看起來心情很好呀！"
        ],
        sad: [
            "怎麼了嗎？是不是遇到什麼困難？",
            "要不要休息一下？",
            "別擔心，一切都會好起來的！",
            "需要幫助嗎？",
            "別難過，明天又是新的一天！"
        ],
        surprised: [
            "哇，你看起來很驚訝呢！",
            "發生什麼有趣的事了嗎？",
            "你的表情真有趣！",
            "是不是被嚇到了？",
            "看起來有什麼新的發現？"
        ],
        neutral: [
            "保持認真的表情呢！",
            "在思考什麼呢？",
            "集中精力，繼續加油！",
            "你的表情很沉靜呀！"
        ],
        angry: [
            "看起來有點生氣呢？",
            "是不是遇到什麼煩心事了？",
            "深呼吸，冷靜一下喔！",
            "別著急，慢慢來！"
        ]
    },
    'zh-CN': {
        happy: [
            "你今天看起来心情不错哦！",
            "你的笑容很灿烂呢！",
            "保持开心的心情，继续加油！",
            "你笑得真开心，真棒！",
            "看起来心情很好呀！"
        ],
        sad: [
            "怎么了吗？是不是遇到什么困难？",
            "要不要休息一下？",
            "别担心，一切都会好起来的！",
            "需要帮助吗？",
            "别难过，明天又是新的一天！"
        ],
        surprised: [
            "哇，你看起来很惊讶呢！",
            "发生什么有趣的事了吗？",
            "你的表情真有趣！",
            "是不是被吓到了？",
            "看起来有什么新的发现？"
        ],
        neutral: [
            "保持认真的表情呢！",
            "在思考什么呢？",
            "集中精力，继续加油！",
            "你的表情很沉静呀！"
        ],
        angry: [
            "看起来有点生气呢？",
            "是不是遇到什么烦心事了？",
            "深呼吸，冷静一下哦！",
            "别着急，慢慢来！"
        ]
    },
    'en-US': {
        happy: [
            "You look happy today!",
            "Your smile is beautiful!",
            "Keep up that great mood!",
            "You're smiling so brightly!",
            "Your happiness is contagious!"
        ],
        sad: [
            "What's wrong? Are you okay?",
            "Would you like to take a break?",
            "Don't worry, things will get better!",
            "Do you need help?",
            "Cheer up, tomorrow's a new day!"
        ],
        surprised: [
            "Wow, you look surprised!",
            "Did something exciting happen?",
            "That's an interesting expression!",
            "Did I scare you?",
            "Found something new?"
        ],
        neutral: [
            "You look focused!",
            "What are you thinking about?",
            "Stay concentrated, keep going!",
            "Your expression is thoughtful!"
        ],
        angry: [
            "You look a bit angry?",
            "Is something bothering you?",
            "Take a deep breath and relax!",
            "Don't rush, take it easy!"
        ]
    }
};

// ============ 初始化 ============
async function init() {
    try {
        updateStatus('正在初始化 MediaPipe...', 'loading');
        
        videoElement = document.getElementById('video');
        canvasElement = document.getElementById('canvas');
        canvasCtx = canvasElement.getContext('2d');

        // 初始化 FaceMesh
        faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults(onFaceMeshResults);

        // 初始化相機
        const cameraConstraints = {
            audio: false,
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
        videoElement.srcObject = stream;

        // 設置畫布尺寸
        videoElement.onloadedmetadata = () => {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        };

        // 設置攝像機
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (isRunning) {
                    await faceMesh.send({ image: videoElement });
                }
            },
            width: 640,
            height: 480
        });

        camera.start();
        updateStatus('相機已準備好，點擊開始', 'ready');

        // 綁定事件監聽器
        setupEventListeners();
    } catch (error) {
        console.error('初始化失敗:', error);
        updateStatus('錯誤：無法訪問相機。請檢查權限。', 'error');
    }
}

function setupEventListeners() {
    document.getElementById('startBtn').addEventListener('click', startDetection);
    document.getElementById('stopBtn').addEventListener('click', stopDetection);
    document.getElementById('clearBtn').addEventListener('click', clearFeedbackLog);
    document.getElementById('voiceFeedback').addEventListener('change', (e) => {
        // 如果禁用了語音反饋，停止當前播放
        if (!e.target.checked) {
            synth.cancel();
        }
    });
    document.getElementById('drawFace').addEventListener('change', (e) => {
        if (!e.target.checked) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
    });
    document.getElementById('speechRate').addEventListener('change', (e) => {
        document.getElementById('rateValue').textContent = e.target.value;
    });
}

function startDetection() {
    isRunning = true;
    lastFeedbackTime = 0;
    lastDetectedEmotion = null;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    updateStatus('正在偵測表情...', 'detecting');
    clearFeedbackLog();
}

function stopDetection() {
    isRunning = false;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    updateStatus('已停止偵測', 'ready');
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    synth.cancel();
}

// ============ FaceMesh 結果處理 ============
function onFaceMeshResults(results) {
    // 清空畫布
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (!isRunning) return;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // 繪製人臉關鍵點（如果啟用）
        if (document.getElementById('drawFace').checked) {
            drawFaceMesh(landmarks);
        }

        // 檢測表情
        const emotion = detectEmotion(landmarks);
        updateEmotionDisplay(emotion);

        // 觸發語音反饋
        if (document.getElementById('voiceFeedback').checked) {
            triggerVoiceFeedback(emotion);
        }
    } else {
        // 沒有偵測到人臉
        resetEmotionDisplay();
    }
}

// ============ 繪製人臉關鍵點 ============
function drawFaceMesh(landmarks) {
    // 繪製連接線
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 7],           // 眉毛
        [33, 246], [246, 161], [161, 160],        // 左眉
        [263, 466], [466, 388], [388, 387],       // 右眉
        [173, 157], [157, 158], [158, 159],       // 左眼
        [398, 384], [384, 385], [385, 386],       // 右眼
        [61, 185], [185, 40], [40, 39], [39, 37], // 嘴唇上方
        [291, 409], [409, 270], [270, 269], [269, 267], // 嘴唇下方
        [0, 266], [266, 421], [421, 430]          // 輪廓
    ];

    // 繪製連接線
    canvasCtx.strokeStyle = 'rgba(102, 126, 234, 0.3)';
    canvasCtx.lineWidth = 1;
    for (const [start, end] of connections) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        canvasCtx.beginPath();
        canvasCtx.moveTo(p1.x * canvasElement.width, p1.y * canvasElement.height);
        canvasCtx.lineTo(p2.x * canvasElement.width, p2.y * canvasElement.height);
        canvasCtx.stroke();
    }

    // 繪製關鍵點
    canvasCtx.fillStyle = 'rgba(102, 126, 234, 0.7)';
    for (const landmark of landmarks) {
        canvasCtx.beginPath();
        canvasCtx.arc(landmark.x * canvasElement.width, landmark.y * canvasElement.height, 2, 0, Math.PI * 2);
        canvasCtx.fill();
    }
}

// ============ 表情檢測邏輯 ============
function detectEmotion(landmarks) {
    // 關鍵點索引
    const LEFT_EYE = [33, 246, 161, 160, 159, 158, 157, 173];
    const RIGHT_EYE = [263, 466, 388, 387, 386, 385, 384, 398];
    const MOUTH = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
    const NOSE = [168, 6];
    const LEFT_EYEBROW = [70, 63, 105, 66, 107];
    const RIGHT_EYEBROW = [336, 296, 334, 293, 300];

    // 計算眼睛開放程度
    const leftEyeOpenness = calculateEyeOpenness(landmarks, LEFT_EYE);
    const rightEyeOpenness = calculateEyeOpenness(landmarks, RIGHT_EYE);
    const eyeOpenness = (leftEyeOpenness + rightEyeOpenness) / 2;

    // 計算嘴部形狀（微笑程度）
    const mouthWidth = Math.hypot(
        landmarks[61].x - landmarks[291].x,
        landmarks[61].y - landmarks[291].y
    );
    const mouthHeight = Math.hypot(
        landmarks[0].x - landmarks[17].x,
        landmarks[0].y - landmarks[17].y
    );
    const smileIndex = mouthWidth / mouthHeight;

    // 計算嘴部開度
    const mouthOpenness = Math.hypot(
        landmarks[13].x - landmarks[14].x,
        landmarks[13].y - landmarks[14].y
    );

    // 計算眉毛位置（上升程度）
    const leftEyebrowHeight = (landmarks[70].y + landmarks[63].y + landmarks[105].y) / 3;
    const rightEyebrowHeight = (landmarks[336].y + landmarks[296].y + landmarks[334].y) / 3;
    const eyebrowHeight = (leftEyebrowHeight + rightEyebrowHeight) / 2;
    const leftEyeAvgY = (landmarks[LEFT_EYE[0]].y + landmarks[LEFT_EYE[3]].y) / 2;
    const eyebrowRaise = leftEyeAvgY - eyebrowHeight;

    // 判定表情
    let emotion = {
        happy: 0,
        sad: 0,
        surprised: 0,
        angry: 0,
        neutral: 0
    };

    // 開心：嘴角上升，眼睛有皺紋
    if (smileIndex > 2.5 && eyeOpenness > 0.3) {
        emotion.happy = Math.min(100, (smileIndex - 2.5) * 50 + (eyeOpenness - 0.3) * 100);
    }

    // 傷心：嘴角下垂，眼睛稍微閉合
    if (smileIndex < 1.5 && eyeOpenness < 0.4) {
        emotion.sad = Math.min(100, (1.5 - smileIndex) * 50 + (0.4 - eyeOpenness) * 100);
    }

    // 驚訝：眼睛大開，嘴巴張開，眉毛上升
    if (eyeOpenness > 0.5 && mouthOpenness > 0.04 && eyebrowRaise > 0.02) {
        emotion.surprised = Math.min(100, (eyeOpenness - 0.5) * 200 + (mouthOpenness - 0.04) * 200 + (eyebrowRaise - 0.02) * 500);
    }

    // 憤怒：眉毛下沉，眼睛稍微閉合
    if (eyebrowRaise < -0.01 && eyeOpenness < 0.35) {
        emotion.angry = Math.min(100, (0.01 + Math.abs(eyebrowRaise)) * 1000 + (0.35 - eyeOpenness) * 100);
    }

    // 如果都沒有明顯的表情，則為中立
    const maxEmotion = Math.max(...Object.values(emotion));
    if (maxEmotion < 20) {
        emotion.neutral = 50;
    } else {
        emotion.neutral = Math.max(0, 50 - maxEmotion / 2);
    }

    // 標準化分數
    const total = Object.values(emotion).reduce((a, b) => a + b, 0);
    for (const key in emotion) {
        emotion[key] = Math.round((emotion[key] / total) * 100);
    }

    return emotion;
}

function calculateEyeOpenness(landmarks, eyeIndices) {
    // 計算眼睛開放程度
    const top = landmarks[eyeIndices[1]].y;
    const bottom = landmarks[eyeIndices[4]].y;
    const left = landmarks[eyeIndices[0]].x;
    const right = landmarks[eyeIndices[3]].x;

    const height = Math.abs(bottom - top);
    const width = Math.abs(right - left);

    return height / (width || 0.1);
}

// ============ 表情顯示更新 ============
function updateEmotionDisplay(emotion) {
    const emotionDisplay = document.getElementById('emotionDisplay');
    const emotionItems = {
        'neutral': 'emoji-neutral',
        'happy': 'emoji-happy',
        'sad': 'emoji-sad',
        'surprised': 'emoji-surprised'
    };

    for (const [emotionName, elementId] of Object.entries(emotionItems)) {
        const element = document.getElementById(elementId);
        const value = emotion[emotionName] || 0;
        
        element.querySelector('.emotion-value').textContent = value + '%';

        if (value > 40) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    }
}

function resetEmotionDisplay() {
    const emotionItems = ['emoji-neutral', 'emoji-happy', 'emoji-sad', 'emoji-surprised'];
    emotionItems.forEach(id => {
        document.getElementById(id).querySelector('.emotion-value').textContent = '0%';
        document.getElementById(id).classList.remove('active');
    });
}

// ============ 語音反饋 ============
function triggerVoiceFeedback(emotion) {
    const currentTime = Date.now();
    
    // 確定主要表情
    let dominantEmotion = null;
    let maxScore = 0;
    
    for (const [emotionName, score] of Object.entries(emotion)) {
        if (score > maxScore && score > 30) {
            maxScore = score;
            dominantEmotion = emotionName;
        }
    }

    // 只有當主要表情改變或冷卻時間已過時才觸發反饋
    if (
        (dominantEmotion !== lastDetectedEmotion || currentTime - lastFeedbackTime > FEEDBACK_COOLDOWN) &&
        dominantEmotion
    ) {
        lastDetectedEmotion = dominantEmotion;
        lastFeedbackTime = currentTime;

        const language = document.getElementById('language').value;
        const responses = emotionResponses[language] || emotionResponses['zh-TW'];
        const responseList = responses[dominantEmotion] || responses.neutral;
        const randomResponse = responseList[Math.floor(Math.random() * responseList.length)];

        speak(randomResponse, language);
        addFeedbackLog(randomResponse);
    }
}

function speak(text, language) {
    // 取消之前的語音
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = parseFloat(document.getElementById('speechRate').value);
    utterance.pitch = 1;
    utterance.volume = 1;

    synth.speak(utterance);
}

function addFeedbackLog(text) {
    const feedbackLog = document.getElementById('feedbackLog');
    const timestamp = new Date().toLocaleTimeString('zh-TW');
    
    // 如果是第一條記錄，清除預設文字
    if (feedbackLog.children[0]?.textContent === '等待表情偵測...') {
        feedbackLog.innerHTML = '';
    }

    const feedbackItem = document.createElement('div');
    feedbackItem.className = 'feedback-item';
    feedbackItem.textContent = `[${timestamp}] ${text}`;

    feedbackLog.insertBefore(feedbackItem, feedbackLog.firstChild);

    // 保持最多顯示 10 條記錄
    while (feedbackLog.children.length > 10) {
        feedbackLog.removeChild(feedbackLog.lastChild);
    }
}

function clearFeedbackLog() {
    const feedbackLog = document.getElementById('feedbackLog');
    feedbackLog.innerHTML = '<div class="feedback-item">記錄已清除</div>';
    setTimeout(() => {
        if (isRunning) {
            feedbackLog.innerHTML = '<div class="feedback-item">等待表情偵測...</div>';
        }
    }, 2000);
}

// ============ 狀態更新 ============
function updateStatus(message, status) {
    const statusElement = document.getElementById('status');
    statusElement.className = `status ${status}`;
    statusElement.textContent = message;
}

// ============ 程式入口 ============
window.addEventListener('load', init);

// 頁面離開時清理資源
window.addEventListener('beforeunload', () => {
    if (camera) camera.stop();
    if (synth) synth.cancel();
});
