import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  githubRepo: {
    owner: String,
    repo: String,
    fullName: String,
    url: String
  },
  description: {
    type: String
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['owner', 'collaborator', 'contributor'],
      default: 'contributor'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  chatRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom'
  }, // Keep for backward compatibility - will be the default/main chatroom
  chatRooms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom'
  }], // Array to support multiple chatrooms per project
  settings: {
    public: {
      type: Boolean,
      default: false
    }
  },
  groupCode: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Project', projectSchema);
