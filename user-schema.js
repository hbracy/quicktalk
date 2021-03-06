const mongoose = require('mongoose')
const uniqueValidator = require('mongoose-unique-validator')
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt-nodejs');
SALT_WORK_FACTOR = 10;

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
	},
	
	availableTime: {
		type: Number,
		default: 3600
	}
//	loginToken: {
//		type: String
//	}
});

UserSchema.pre('save', function(next) {
    var user = this;

    // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) return next();

    // generate a salt
    bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
        if (err) return next(err);

        // hash the password using our new salt
        bcrypt.hash(user.password, salt, null, function(err, hash) {
            if (err) return next(err);

            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        });
    });
});

UserSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};

UserSchema.plugin(uniqueValidator)

var User = mongoose.model('user', UserSchema);
module.exports = User;
