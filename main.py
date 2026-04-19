import os
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'la_tua_chiave_segreta_123'
app.config['SQLALCHEMY_DATABASE_SETTING'] = 'sqlite:///database.db'
app.config['UPLOAD_FOLDER'] = 'static/profile_pics'

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# --- MODELLI DEL DATABASE ---

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nickname = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    profile_image = db.Column(db.String(200), default='default.png')
    # Relazione: un utente può avere molte carte
    carte = db.relationship('Carta', backref='autore', lazy=True)

class Carta(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    rarita = db.Column(db.String(50), nullable=False)
    immagine_url = db.Column(db.String(200))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # Sistema Like
    likes = db.relationship('Like', backref='carta', lazy=True)

class Like(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    carta_id = db.Column(db.Integer, db.ForeignKey('carta.id'), nullable=False)

# --- ROTTE (PAGINE DEL SITO) ---

@app.route('/')
def index():
    tutte_le_carte = Carta.query.all()
    return render_template('index.html', carte=tutte_le_carte)

# Altre rotte verranno aggiunte qui...

if __name__ == '__main__':
    with app.app_context():
        db.create_all() # Crea il database se non esiste
    app.run(host='0.0.0.0', port=8080)
