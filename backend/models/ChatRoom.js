import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'voice', 'ai_code', 'system', 'image', 'file', 'dk_bot', 'chaiwala_bot'],
    default: 'text'
  },
  dkBotData: {
    type: {
      type: String, // 'stats', 'notification', 'activity'
      enum: ['stats', 'notification', 'activity']
    },
    githubData: mongoose.Schema.Types.Mixed
  },
  voiceUrl: {
    type: String
  },
  aiPrompt: {
    type: String
  },
  aiResponse: {
    code: String,
    explanation: String,
    language: String
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Message actions
  edited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  // Reactions
  reactions: [{
    emoji: String,
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    _id: false
  }],
  // Engagement
  starredBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    },
    _id: false
  }],
  // File attachments
  attachments: [{
    type: {
      type: String, // 'image', 'file', 'document', 'pdf', etc.
      enum: ['image', 'file', 'document', 'pdf', 'code']
    },
    url: String,
    filename: String,
    size: Number,
    mimeType: String,
    _id: false
  }],
  // Rich formatting
  richContent: {
    type: mongoose.Schema.Types.Mixed // Store formatted content structure
  }
}, {
  timestamps: true
});

const chatRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  repository: {
    type: String, // GitHub repo full name (owner/repo) for repository-only chatrooms
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  messages: [messageSchema],
  lastMessage: {
    type: Date,
    default: Date.now
  },
  pinnedMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  settings: {
    allowFileUploads: {
      type: Boolean,
      default: true
    },
    allowEditing: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

export default mongoose.model('ChatRoom', chatRoomSchema);
