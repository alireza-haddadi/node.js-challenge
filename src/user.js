const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const SALT_WORK_FACTOR = 10;

const UserSchema = new mongoose.Schema({
    firstname: { type: 'string', required: true },
    lastname: { type: 'string', required: true },
    email: { type: 'string', required: true },
    password: { type: 'string', required: true },
    lang: 'string',
    country: 'string'
});

UserSchema.index({ email: 1 }, { unique: true });

UserSchema.statics.getUsers = async function (_conditions, _projection, _options) {
    try {
        var conditions = {}, projection = '+_id', options = { lean: false, sort: { _id: -1 } };

        if (!!_conditions) {
            conditions = _conditions;
        }
        if (!!_projection) {
            projection = _projection;
        }
        if (!!_options) {
            options = _options;
        }

        return this.find(conditions, projection, options).exec();
    } catch (error) {
        throw error;
    }
}
UserSchema.statics.addUser = async function (document) {
    try {
        if (!document.firstname || !document.lastname || !document.email || !document.password || !document.password_repeat) {
            throw new Error("register:required_field_missing");
        }
        if (!/@/.test(document.email)) {
            throw new Error("register:email_failed_pattern_test");
        }
        if (!/\w{8}/.test(document.password)) {
            throw new Error("register:password_failed_pattern_test");
        }
        if (document.password !== document.password_repeat) {
            throw new Error("register:password_repeat_does_not_match");
        }
        
        var newUser = new Object();

        newUser.firstname = document.firstname;
        newUser.lastname = document.lastname;
        newUser.email = document.email;
        newUser.password = document.password;
        newUser.lang = document.lang;
        newUser.country = document.country;

        var document = new this(newUser);

        return document.save();
    } catch (error) {
        throw error;
    }
}
UserSchema.pre('save', function (next) {
    var user = this;
    if (user.isModified('password')) {
        bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
            if (err) next(error);
            bcrypt.hash(user.password, salt, function (err, hash) {
                if (err) next(error);
                user.password = hash;
                next();
            });
        });
    }
    else {
        next();
    }
});
UserSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);