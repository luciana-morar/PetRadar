const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs'); // <-- Adaugat

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "http://localhost:8100", methods: ["GET", "POST"], credentials: true }
});

let pets = [];
const FILE = './pets.json';

pets = JSON.parse(fs.readFileSync(FILE, 'utf8'));

function save() {
    fs.writeFileSync(FILE, JSON.stringify(pets, null, 2));
}

app.get('/api/pets', (req, res) => {
    res.json(pets);
});

app.get('/api/pets/:id', (req, res) => {
    const pet = pets.find(p => p.id === parseInt(req.params.id));
    if (!pet) return res.status(404).json({ error: 'Not found' });
    res.json(pet);
});

app.post('/api/pets', (req, res) => {
    const newPet = { id: Date.now(), ...req.body }; // ID unic bazat pe timp
    pets.push(newPet);
    save();
    io.emit('pet:created', newPet);
    res.status(201).json(newPet);
});

app.put('/api/pets/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = pets.findIndex(p => p.id === id);
    if (index !== -1) {
        pets[index] = { ...pets[index], ...req.body };
        save();
        io.emit('pet:updated', pets[index]);
        res.json(pets[index]);
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

io.on('connection', (socket) => {
    console.log('Client conectat');
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server pe http://localhost:${PORT}`);
});