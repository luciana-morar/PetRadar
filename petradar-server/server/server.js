const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

require('dotenv').config();

const PORT = 3000;
const SECRET = process.env.SECRET || 'fallback-secret-local';
const FILE = path.join(__dirname, 'pets.json');

// Utilizatori de test
const users = [
    { id: 1, username: 'ana', password: '1234' },
    { id: 2, username: 'ion', password: '1234' }
];

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------- "baza de date" (fisier JSON) ----------
let pets = [];
try {
    pets = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {}
pets.forEach(p => { p.userId = p.userId || 1; });      // animalele vechi ii apartin lui "ana"

const save = () => fs.writeFileSync(FILE, JSON.stringify(pets, null, 2));

// ---------- helpere ----------
const ownedBy = req => pets.filter(p => p.userId === req.user.id);
const emit = (req, event, pet) => io.to('user:' + req.user.id).emit(event, pet);   // doar proprietarul

// gaseste animalul din URL (doar daca e al utilizatorului) sau raspunde 404
function petOr404(req, res, next) {
    req.pet = ownedBy(req).find(p => p.id === parseInt(req.params.id));
    return req.pet ? next() : res.status(404).json({ error: 'Not found' });
}

// ---------- ping + autentificare ----------
app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const u = users.find(x => x.username === username && x.password === password);
    if (!u) return res.status(401).json({ error: 'Date de autentificare gresite' });
    const token = jwt.sign({ id: u.id, username: u.username }, SECRET, { expiresIn: '2h' });
    res.json({ token, id: u.id, username: u.username });
});

// toate rutele /api/pets cer token valid
app.use('/api/pets', (req, res, next) => {
    try {
        req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
        next();
    } catch (e) {
        res.status(401).json({ error: 'Neautorizat' });
    }
});

// ---------- REST ----------
// GET /api/pets?page=1&limit=10&search=max&status=pierdut
app.get('/api/pets', (req, res) => {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const q = (req.query.search || '').toLowerCase().trim();
    const status = req.query.status;

    const list = ownedBy(req)
        .filter(p => !status || p.status === status)
        .filter(p => !q || [p.name, p.species, p.location, p.description].join(' ').toLowerCase().includes(q))
        .sort((a, b) => b.id - a.id);                  // cele mai noi primele

    res.json({
        items: list.slice((page - 1) * limit, page * limit),
        total: list.length,
        page,
        hasMore: page * limit < list.length
    });
});

app.get('/api/pets/:id', petOr404, (req, res) => res.json(req.pet));

app.post('/api/pets', (req, res) => {
    // id si userId se pun DUPA req.body, ca sa nu poata fi falsificate de client
    const pet = { ...req.body, id: Date.now(), userId: req.user.id };
    pets.push(pet);
    save();
    emit(req, 'pet:created', pet);
    res.status(201).json(pet);
});

app.put('/api/pets/:id', petOr404, (req, res) => {
    Object.assign(req.pet, req.body, { id: req.pet.id, userId: req.user.id });
    save();
    emit(req, 'pet:updated', req.pet);
    res.json(req.pet);
});
app.delete('/api/pets/:id', petOr404, (req, res) => {
    pets.splice(pets.indexOf(req.pet), 1);
    save();
    emit(req, 'pet:deleted', req.pet);
    res.json(req.pet);
});

// ---------- WebSocket securizat ----------
io.use((socket, next) => {
    try {
        socket.user = jwt.verify((socket.handshake.auth || {}).token, SECRET);
        next();
    } catch (e) {
        next(new Error('unauthorized'));
    }
});

io.on('connection', socket => {
    socket.join('user:' + socket.user.id);             // "camera" personala
    console.log('Client conectat:', socket.user.username);
});

server.listen(PORT, () => console.log(`Server pe http://localhost:${PORT}`));
