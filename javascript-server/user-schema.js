const mongoose = require('mongoose')
const uniqueValidator = require('mongoose-unique-validator')
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt-nodejs');

const UserSchema = new Schema({
  email: {
       type: String,
       required: true,
       unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
	password: {
		type: String,
		required: true
	}
});

UserSchema.methods.generateHash = function(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};

UserSchema.methods.validPassword = function(password) {
  return bcrypt.compareSync(password, this.password);
};

UserSchema.plugin(uniqueValidator)

var User = mongoose.model('user', UserSchema);
module.exports = User;
