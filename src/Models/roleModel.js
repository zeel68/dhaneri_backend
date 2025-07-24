import mongoose from 'mongoose';
const { Schema } = mongoose;

const roleSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Role name is required'],
        unique: [true, 'Role name must be unique'],
        trim: true,
        minlength: [2, 'Role name must be at least 2 characters'],
        maxlength: [50, 'Role name cannot exceed 50 characters']
    }
}, {
    timestamps: false,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});


export const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);
