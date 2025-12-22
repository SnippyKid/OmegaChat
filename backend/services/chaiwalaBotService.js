/**
 * ChaiWala Bot - Welcome Bot for New Members
 * Provides funny, friendly welcome messages when new members join chatrooms
 */

const welcomeMessages = [
  {
    greeting: "Namaste! 👋",
    message: "Welcome to the chatroom! Do you want chai ☕ or coffee ☕? Just kidding, both are available! 😄",
    followUp: "Feel free to introduce yourself and start chatting!"
  },
  {
    greeting: "Hey there! 🌟",
    message: "Welcome! I'm ChaiWala, your friendly neighborhood bot! Would you like some tea 🍵 or coffee ☕? Or maybe both? 😊",
    followUp: "Don't be shy, say hi to everyone!"
  },
  {
    greeting: "Hello! 🎉",
    message: "New member alert! 🚨 Welcome! I've got chai, coffee, and some great conversations brewing! What's your pick? ☕🍵",
    followUp: "Make yourself at home and enjoy the chat!"
  },
  {
    greeting: "Hi! 👋",
    message: "Welcome aboard! ChaiWala here! ☕ I see you've joined us. How about a warm cup of chai or coffee to celebrate? 🎊",
    followUp: "The team is excited to have you here!"
  },
  {
    greeting: "Namaskar! 🙏",
    message: "A new face! Welcome! I'm ChaiWala and I serve the best virtual chai ☕ and coffee ☕ in town! Which one would you like? 😄",
    followUp: "Don't worry, it's all free! Just enjoy the conversation!"
  },
  {
    greeting: "Hey! 🎈",
    message: "Welcome to the chatroom! I'm ChaiWala, and I'm here to make your stay warm and cozy! Tea ☕ or coffee ☕? Both? 😊",
    followUp: "Feel free to jump into any conversation!"
  },
  {
    greeting: "Hello there! 👋",
    message: "New member detected! 🎊 Welcome! ChaiWala at your service! Would you like some chai ☕ to warm up? Or coffee ☕ to energize?",
    followUp: "We're glad to have you join us!"
  },
  {
    greeting: "Hi! 🌈",
    message: "Welcome! I'm ChaiWala, the chatroom's tea and coffee expert! ☕🍵 What brings you here? And more importantly, chai or coffee? 😄",
    followUp: "Don't be a stranger, start chatting whenever you're ready!"
  }
];

/**
 * Generate a random welcome message for a new member
 */
export function generateWelcomeMessage(memberName, roomName) {
  const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
  
  return `${randomMessage.greeting} Welcome **${memberName}** to ${roomName ? `**${roomName}**` : 'the chatroom'}! 👋\n\n${randomMessage.message}\n\n${randomMessage.followUp}`;
}

/**
 * Format a simple greeting message
 */
export function formatGreetingMessage(memberName, roomName) {
  return generateWelcomeMessage(memberName, roomName);
}
