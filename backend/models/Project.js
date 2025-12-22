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
  },
  settings: {
    public: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

export default mongoose.model('Project', projectSchema);
