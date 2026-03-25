import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true }, // duplicates allowed
  password: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  trustedContacts: [{ type: String }],
});

const User = mongoose.model("User", UserSchema);
export default User;





