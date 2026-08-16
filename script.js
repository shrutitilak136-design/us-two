// ======================================================
// FIREBASE CONFIG
// ======================================================

const firebaseConfig = {
    apiKey: "AIzaSyCdoB4N-26Wjvye4rNxdNHr6wJacn61JZc",
    authDomain: "ss-two.firebaseapp.com",
    databaseURL: "https://ss-two-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ss-two",
    storageBucket: "ss-two.firebasestorage.app",
    messagingSenderId: "640666390190",
    appId: "1:640666390190:web:5a21bebf8cef7b0ab2273f"
};


// ======================================================
// FIREBASE START
// ======================================================

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();


// ======================================================
// GLOBAL VARIABLES
// ======================================================

let currentUser = null;
let currentCoupleId = null;

let messageListener = null;
let memoriesListener = null;
let partnerListener = null;

let currentPartnerUid = null;

let quizIndex = 0;
let quizScore = 0;


// ======================================================
// DOM HELPERS
// ======================================================

function $(id) {
    return document.getElementById(id);
}


function toast(message) {

    const box = $("toast");

    box.textContent = message;
    box.classList.add("show");

    setTimeout(() => {
        box.classList.remove("show");
    }, 2500);
}


// ======================================================
// AUTH
// ======================================================

function showLogin() {

    $("loginForm").classList.remove("hidden");
    $("signupForm").classList.add("hidden");
}


function showSignup() {

    $("loginForm").classList.add("hidden");
    $("signupForm").classList.remove("hidden");
}


async function signup() {

    const name = $("signupName").value.trim();
    const email = $("signupEmail").value.trim();
    const password = $("signupPassword").value;

    if (!name || !email || !password) {

        toast("Please fill everything ❤️");
        return;
    }

    if (password.length < 6) {

        toast("Password must be at least 6 characters");
        return;
    }

    try {

        const result =
            await auth.createUserWithEmailAndPassword(
                email,
                password
            );

        const user = result.user;

        await db.ref("users/" + user.uid).set({

            uid: user.uid,
            name: name,
            email: email,

            coupleId: null,

            online: true,

            createdAt: firebase.database.ServerValue.TIMESTAMP

        });

        toast("Account created ❤️");

    } catch (error) {

        toast(error.message);
    }
}


async function login() {

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    if (!email || !password) {

        toast("Enter email and password");
        return;
    }

    try {

        await auth.signInWithEmailAndPassword(
            email,
            password
        );

    } catch (error) {

        toast(error.message);
    }
}


async function logout() {

    if (currentUser) {

        try {

            await db.ref(
                "users/" + currentUser.uid + "/online"
            ).set(false);

        } catch (error) {}

    }

    await auth.signOut();
}


// ======================================================
// AUTH STATE
// ======================================================

auth.onAuthStateChanged(async function(user) {

    $("loadingScreen").classList.add("hidden");

    if (!user) {

        currentUser = null;

        $("app").classList.add("hidden");
        $("authScreen").classList.remove("hidden");

        return;
    }

    currentUser = user;

    $("authScreen").classList.add("hidden");
    $("app").classList.remove("hidden");

    await setupUser();

    requestNotifications();

    startPresence();

    loadCouple();

});


// ======================================================
// USER SETUP
// ======================================================

async function setupUser() {

    const ref =
        db.ref("users/" + currentUser.uid);

    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {

        await ref.set({

            uid: currentUser.uid,

            name:
                currentUser.email.split("@")[0],

            email: currentUser.email,

            coupleId: null,

            online: true,

            createdAt:
                firebase.database.ServerValue.TIMESTAMP

        });

    }

    const userData =
        (await ref.once("value")).val();

    $("welcomeText").textContent =
        "Hi " + userData.name + " ❤️";

}


// ======================================================
// COUPLE CREATION
// ======================================================

function generateCoupleCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 8; i++) {

        code +=
            chars.charAt(
                Math.floor(Math.random() * chars.length)
            );

    }

    return code;
}


async function createCouple() {

    if (!currentUser) {
        toast("Please login first ❤️");
        return;
    }

    try {

        const code = generateCoupleCode();

        // Directly create the couple.
        // No read/check is needed because the code is randomly generated.
        await db.ref("couples/" + code).set({

            code: code,

            createdAt:
                firebase.database.ServerValue.TIMESTAMP,

            members: {

                [currentUser.uid]: true

            }

        });

        // Save couple ID in current user's profile
        await db.ref(
            "users/" +
            currentUser.uid +
            "/coupleId"
        ).set(code);

        currentCoupleId = code;

        $("coupleSetup").classList.add("hidden");
        $("coupleInfo").classList.remove("hidden");

        $("coupleCodeDisplay").textContent = code;

        toast("Couple created successfully ❤️");

        loadPartner();
        loadMessages();
        loadMemories();

    } catch (error) {

        console.error("Create Couple Error:", error);

        toast("Access denied. Check Firebase Rules.");

    }
}


// ======================================================
// JOIN COUPLE
// ======================================================

async function joinCouple() {

    if (!currentUser) return;

    const code =
        $("joinCode").value.trim().toUpperCase();

    if (code.length < 8) {

        toast("Enter the correct couple code");
        return;
    }

    try {

        const coupleRef =
            db.ref("couples/" + code);

        const snapshot =
            await coupleRef.once("value");

        if (!snapshot.exists()) {

            toast("Couple code not found");
            return;
        }

        const couple = snapshot.val();

        const members =
            couple.members || {};

        const memberIds =
            Object.keys(members);

        if (memberIds.length >= 2) {

            toast("This couple already has two members");
            return;
        }

        if (members[currentUser.uid]) {

            toast("You are already connected");
            return;
        }

        await coupleRef.child(
            "members/" + currentUser.uid
        ).set(true);

        await db.ref(
            "users/" +
            currentUser.uid +
            "/coupleId"
        ).set(code);

        toast("Partner connected ❤️");

        loadCouple();

    } catch (error) {

        toast(error.message);
    }
}


// ======================================================
// LOAD COUPLE
// ======================================================

async function loadCouple() {

    if (!currentUser) return;

    const userSnapshot =
        await db.ref(
            "users/" +
            currentUser.uid
        ).once("value");

    const userData =
        userSnapshot.val();

    if (!userData || !userData.coupleId) {

        currentCoupleId = null;

        $("coupleSetup").classList.remove("hidden");
        $("coupleInfo").classList.add("hidden");

        return;
    }

    currentCoupleId =
        userData.coupleId;

    $("coupleSetup").classList.add("hidden");
    $("coupleInfo").classList.remove("hidden");

    $("coupleCodeDisplay").textContent =
        currentCoupleId;

    loadPartner();

    loadMessages();

    loadMemories();
}


// ======================================================
// PARTNER
// ======================================================

async function loadPartner() {

    if (!currentCoupleId) return;

    if (partnerListener) {

        partnerListener.off();
    }

    const membersSnapshot =
        await db.ref(
            "couples/" +
            currentCoupleId +
            "/members"
        ).once("value");

    const members =
        membersSnapshot.val() || {};

    const partner =
        Object.keys(members)
        .find(uid => uid !== currentUser.uid);

    if (!partner) {

        currentPartnerUid = null;

        $("partnerStatus").textContent =
            "Waiting for partner...";

        return;
    }

    currentPartnerUid = partner;

    partnerListener =
        db.ref(
            "users/" +
            partner +
            "/online"
        );

    partnerListener.on(
        "value",
        snapshot => {

            const online =
                snapshot.val() === true;

            $("partnerStatus").textContent =
                online
                    ? "Partner is online ❤️"
                    : "Partner is offline";

            $("chatPartnerStatus").textContent =
                online
                    ? "Online ❤️"
                    : "Offline";
        }
    );
}


// ======================================================
// PRESENCE
// ======================================================

function startPresence() {

    if (!currentUser) return;

    const userStatusRef =
        db.ref(
            "users/" +
            currentUser.uid +
            "/online"
        );

    const connectedRef =
        db.ref(".info/connected");

    connectedRef.on(
        "value",
        snapshot => {

            if (snapshot.val() !== true) {

                $("onlineStatus").textContent =
                    "● Offline";

                return;
            }

            userStatusRef
                .onDisconnect()
                .set(false);

            userStatusRef.set(true);

            $("onlineStatus").textContent =
                "● Online";
        }
    );
}


// ======================================================
// HOME
// ======================================================

function showHome() {

    hideScreens();

    $("homeScreen").style.display = "block";
}


function hideScreens() {

    $("chatScreen").style.display = "none";
    $("memoriesScreen").style.display = "none";
    $("gamesScreen").style.display = "none";
    $("quizScreen").style.display = "none";
}


// ======================================================
// CHAT
// ======================================================

function openChat() {

    if (!currentCoupleId) {

        toast("Connect your partner first ❤️");
        return;
    }

    hideScreens();

    $("chatScreen").style.display = "block";

    loadMessages();
}


function closeChat() {

    showHome();
}


function loadMessages() {

    if (!currentCoupleId) return;

    const ref =
        db.ref(
            "messages/" +
            currentCoupleId
        ).limitToLast(100);

    if (messageListener) {

        ref.off("value", messageListener);
    }

    messageListener =
        ref.on(
            "value",
            snapshot => {

                const messages =
                    $("messages");

                messages.innerHTML = "";

                snapshot.forEach(
                    child => {

                        renderMessage(
                            child.key,
                            child.val()
                        );

                    }
                );

                messages.scrollTop =
                    messages.scrollHeight;
            }
        );
}


function renderMessage(id, message) {

    const messages =
        $("messages");

    const div =
        document.createElement("div");

    const mine =
        message.senderId === currentUser.uid;

    div.className =
        mine
            ? "message my-message"
            : "message partner-message";


    const text =
        document.createElement("div");

    text.className = "message-text";

    text.textContent =
        message.text || "";

    div.appendChild(text);


    const meta =
        document.createElement("div");

    meta.className = "message-meta";

    meta.textContent =
        formatTime(message.time);

    div.appendChild(meta);


    const reactions =
        document.createElement("div");

    reactions.className = "reactions";

    ["❤️", "😂", "😘"].forEach(
        emoji => {

            const btn =
                document.createElement("button");

            btn.className =
                "reaction-btn";

            btn.textContent = emoji;

            btn.onclick = () =>
                reactToMessage(id, emoji);

            reactions.appendChild(btn);

        }
    );

    div.appendChild(reactions);

    messages.appendChild(div);
}


async function sendMessage() {

    if (!currentCoupleId) {

        toast("Connect your partner first");
        return;
    }

    const input =
        $("messageInput");

    const text =
        input.value.trim();

    if (!text) return;


    try {

        await db.ref(
            "messages/" +
            currentCoupleId
        ).push({

            text: text,

            senderId:
                currentUser.uid,

            time:
                firebase.database.ServerValue.TIMESTAMP

        });

        input.value = "";

    } catch (error) {

        toast(error.message);
    }
}


async function reactToMessage(
    messageId,
    emoji
) {

    if (!currentCoupleId) return;

    await db.ref(
        "messages/" +
        currentCoupleId +
        "/" +
        messageId +
        "/reactions/" +
        currentUser.uid
    ).set(emoji);

    toast(emoji + " ❤️");
}


function formatTime(timestamp) {

    if (!timestamp) return "";

    return new Date(timestamp)
        .toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
}


$("messageInput").addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Enter") {

            sendMessage();
        }

    }
);


// ======================================================
// I MISS YOU
// ======================================================

async function missYou() {

    if (!currentCoupleId) {

        toast("Connect your partner first ❤️");
        return;
    }

    await db.ref(
        "missYou/" +
        currentCoupleId
    ).push({

        senderId:
            currentUser.uid,

        time:
            firebase.database.ServerValue.TIMESTAMP

    });

    toast("I Miss You sent ❤️");

    showNotification(
        "Us Two ❤️",
        "Your partner misses you!"
    );
}


// ======================================================
// MEMORIES
// ======================================================

function openMemories() {

    if (!currentCoupleId) {

        toast("Connect your partner first ❤️");
        return;
    }

    hideScreens();

    $("memoriesScreen").style.display =
        "block";

    loadMemories();
}


async function uploadMemory() {

    if (!currentCoupleId) {

        toast("Connect your partner first");
        return;
    }

    const input =
        $("memoryInput");

    const file =
        input.files[0];

    if (!file) {

        toast("Select a photo first 📸");
        return;
    }

    if (!file.type.startsWith("image/")) {

        toast("Please select an image");
        return;
    }


    try {

        toast("Uploading memory... ❤️");

        const fileName =
            Date.now() +
            "_" +
            file.name.replace(
                /[^a-zA-Z0-9._-]/g,
                "_"
            );

        const storageRef =
            storage.ref(
                "memories/" +
                currentCoupleId +
                "/" +
                fileName
            );

        const upload =
            await storageRef.put(file);

        const url =
            await upload.ref.getDownloadURL();

        await db.ref(
            "memories/" +
            currentCoupleId
        ).push({

            url: url,

            senderId:
                currentUser.uid,

            time:
                firebase.database.ServerValue.TIMESTAMP

        });

        input.value = "";

        toast("Memory saved ❤️");

    } catch (error) {

        toast(error.message);
    }
}


function loadMemories() {

    if (!currentCoupleId) return;

    const ref =
        db.ref(
            "memories/" +
            currentCoupleId
        );

    if (memoriesListener) {

        ref.off("value", memoriesListener);
    }

    memoriesListener =
        ref.on(
            "value",
            snapshot => {

                const grid =
                    $("memoriesGrid");

                grid.innerHTML = "";

                snapshot.forEach(
                    child => {

                        const memory =
                            child.val();

                        const card =
                            document.createElement("div");

                        card.className =
                            "memory-card";

                        card.innerHTML = `
                            <img
                                src="${memory.url}"
                                alt="Our memory"
                            >
                            <p>
                                ${formatDate(memory.time)}
                            </p>
                        `;

                        grid.appendChild(card);

                    }
                );

            }
        );
}


function formatDate(timestamp) {

    if (!timestamp) return "";

    return new Date(timestamp)
        .toLocaleDateString();
}


// ======================================================
// GAMES
// ======================================================

function openGames() {

    if (!currentCoupleId) {

        toast("Connect your partner first ❤️");
        return;
    }

    hideScreens();

    $("gamesScreen").style.display =
        "block";
}


function loveNumber(number) {

    const messages = [

        "You are my favorite person ❤️",

        "I love you more than yesterday 😘",

        "Distance means nothing to us 💕",

        "You are my safe place 🥰",

        "I would choose you again ❤️",

        "Missing you extra today 🥺",

        "You make my world better 💗",

        "Forever sounds good with you 💍",

        "Sending you a giant hug 🤗",

        "1000 kisses coming your way 😘"

    ];

    $("gameResult").textContent =
        messages[number - 1];
}


function randomQuestion() {

    const questions = [

        "What is my favorite food? 🍕",

        "Where would I love to travel with you? ✈️",

        "What makes me happiest? ❤️",

        "What is my favorite movie? 🎬",

        "What is one thing I always say? 😂",

        "What is my dream date? 🌹",

        "Who fell in love first? 😘"

    ];

    const question =
        questions[
            Math.floor(
                Math.random() *
                questions.length
            )
        ];

    $("randomQuestionResult").textContent =
        question;
}


async function sendLoveGame() {

    if (!currentCoupleId) return;

    const hearts = "❤️".repeat(20);

    await db.ref(
        "messages/" +
        currentCoupleId
    ).push({

        text: hearts,

        senderId:
            currentUser.uid,

        time:
            firebase.database.ServerValue.TIMESTAMP

    });

    toast("100 hearts sent ❤️");
}


// ======================================================
// QUIZ
// ======================================================

const quizQuestions = [

    {
        question: "What do I love most? ❤️",

        options: [
            "You",
            "Food",
            "Sleep",
            "Everything"
        ],

        answer: 0
    },

    {
        question: "Our relationship is... 💕",

        options: [
            "Temporary",
            "Forever",
            "Complicated",
            "Secret"
        ],

        answer: 1
    },

    {
        question: "What should we do together? 🥰",

        options: [
            "Travel",
            "Eat",
            "Watch movies",
            "All of these"
        ],

        answer: 3
    }

];


function openQuiz() {

    if (!currentCoupleId) {

        toast("Connect your partner first ❤️");
        return;
    }

    hideScreens();

    $("quizScreen").style.display =
        "block";

    $("quizQuestion").textContent =
        "Ready for our quiz? ❤️";

    $("quizOptions").innerHTML = "";

    $("quizScore").textContent = "";

}


function startQuiz() {

    quizIndex = 0;
    quizScore = 0;

    showQuizQuestion();
}


function showQuizQuestion() {

    if (quizIndex >= quizQuestions.length) {

        $("quizQuestion").textContent =
            "Quiz complete! ❤️";

        $("quizOptions").innerHTML = "";

        $("quizScore").textContent =
            "Your score: " +
            quizScore +
            "/" +
            quizQuestions.length;

        return;
    }

    const q =
        quizQuestions[quizIndex];

    $("quizQuestion").textContent =
        q.question;

    $("quizOptions").innerHTML = "";

    q.options.forEach(
        (option, index) => {

            const button =
                document.createElement("button");

            button.className =
                "quiz-option";

            button.textContent =
                option;

            button.onclick = () =>
                answerQuiz(index);

            $("quizOptions")
                .appendChild(button);

        }
    );
}


function answerQuiz(index) {

    const question =
        quizQuestions[quizIndex];

    if (index === question.answer) {

        quizScore++;

        toast("Correct! ❤️");

    } else {

        toast("Aww, wrong answer 😂");

    }

    quizIndex++;

    setTimeout(
        showQuizQuestion,
        500
    );
}


// ======================================================
// COPY COUPLE CODE
// ======================================================

async function copyCoupleCode() {

    if (!currentCoupleId) return;

    try {

        await navigator.clipboard.writeText(
            currentCoupleId
        );

        toast("Couple code copied ❤️");

    } catch {

        toast(
            "Your code is: " +
            currentCoupleId
        );
    }
}


// ======================================================
// NOTIFICATIONS
// ======================================================

async function requestNotifications() {

    if (
        "Notification" in window &&
        Notification.permission === "default"
    ) {

        try {

            await Notification.requestPermission();

        } catch (error) {}

    }
}


function showNotification(
    title,
    body
) {

    if (
        "Notification" in window &&
        Notification.permission === "granted"
    ) {

        new Notification(
            title,
            {
                body: body
            }
        );

    }
}


// ======================================================
// COUNTDOWN
// ======================================================

const meetingDate =
    new Date(
        "December 25, 2026 00:00:00"
    ).getTime();


function updateCountdown() {

    const now =
        new Date().getTime();

    const distance =
        meetingDate - now;


    if (distance <= 0) {

        $("days").textContent = "00";
        $("hours").textContent = "00";
        $("minutes").textContent = "00";
        $("seconds").textContent = "00";

        return;
    }


    const days =
        Math.floor(
            distance /
            (1000 * 60 * 60 * 24)
        );


    const hours =
        Math.floor(
            (distance %
                (1000 * 60 * 60 * 24))
            /
            (1000 * 60 * 60)
        );


    const minutes =
        Math.floor(
            (distance %
                (1000 * 60 * 60))
            /
            (1000 * 60)
        );


    const seconds =
        Math.floor(
            (distance %
                (1000 * 60))
            /
            1000
        );


    $("days").textContent =
        String(days).padStart(2, "0");

    $("hours").textContent =
        String(hours).padStart(2, "0");

    $("minutes").textContent =
        String(minutes).padStart(2, "0");

    $("seconds").textContent =
        String(seconds).padStart(2, "0");
}


setInterval(
    updateCountdown,
    1000
);

updateCountdown();