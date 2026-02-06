/* nila.js - The Intelligence Engine for Jewels-Ai */

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const NilaAI = (function() {
    // This prompt defines Nila's personality and knowledge
    const SYSTEM_INSTRUCTION = `
        You are Nila, the luxury AI Concierge for "Jewels-Ai". 
        Your tone is elegant, helpful, and expert.
        You help customers with:
        1. Virtual Try-On: Explain how to use swipes to change jewelry.
        2. Styling: Suggest gold jewelry for weddings or casual wear.
        3. Inventory: You know we have Earrings, Chains, Rings, and Bangles.
        Keep responses concise (2-3 sentences) to fit in a chat bubble.
    `;

    async function ask(userMessage) {
        try {
            const response = await fetch(GEMINI_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: SYSTEM_INSTRUCTION + "\nUser: " + userMessage }]
                    }]
                })
            });

            const data = await response.json();
            const aiText = data.candidates[0].content.parts[0].text;
            
            updateChatUI(aiText);
            speak(aiText); // Optional: Trigger text-to-speech
        } catch (error) {
            console.error("Nila Error:", error);
            updateChatUI("I'm having trouble connecting right now, but I'm still here to help you try on our collection!");
        }
    }

    function updateChatUI(text) {
        const bubble = document.getElementById('nila-bubble');
        if (bubble) {
            bubble.innerText = text;
            bubble.classList.add('active');
            // Auto-hide bubble after 8 seconds
            setTimeout(() => bubble.classList.remove('active'), 8000);
        }
    }

    function speak(text) {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1.2; // Feminine tone
        window.speechSynthesis.speak(utterance);
    }

    return { ask };
})();