document.addEventListener('DOMContentLoaded', () => {
    initGame();
});

async function initGame() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const playerId = urlParams.get('playerId');

    if (!gameId || !playerId) {
        redirectToIndex("Paramètres manquants");
        return;
    }

    if (!window.db) {
        redirectToIndex("Connexion Firebase échouée");
        return;
    }

    const db = window.db;
    const gameRef = db.ref(`games/${gameId}`);
    const playerRef = db.ref(`games/${gameId}/players/${playerId}`);

    initPresence(playerRef);
    gameRef.on('value', (snapshot) => handleGameUpdate(snapshot, gameId, playerId));

    document.getElementById('ready-button').addEventListener('click', () => toggleReady(gameRef, playerRef));
    document.getElementById('leave-game').addEventListener('click', () => leaveGame(playerRef, gameId));
}

function initPresence(playerRef) {
    playerRef.update({ online: true });
    playerRef.onDisconnect().update({ 
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
}

async function handleGameUpdate(snapshot, gameId, playerId) {
    const game = snapshot.val();
    if (!game) return redirectToIndex("Partie supprimée");

    try {
        document.getElementById('display-game-id').textContent = game.gameCode;
        updatePlayersList(game.players, playerId);
        updatePlayerCount(game.players);

        const isHost = game.hostId === playerId;
        
        if (isHost) {
            document.getElementById('host-indicator').classList.remove('hidden');
        } else {
            document.getElementById('host-indicator').classList.add('hidden');
        }

        // Vérification automatique du statut de tous les joueurs
        if (checkAllPlayersReady(game.players)) {  // Parenthèse fermante ajoutée
            if (game.status !== "started") {
                await startGame(db.ref(`games/${gameId}`), gameId);
            }
        }

        if (game.status === "started") {
            await new Promise(resolve => setTimeout(resolve, 1000));
            window.location.href = `game.html?gameId=${gameId}&playerId=${playerId}`;
        }
    } catch (error) {
        console.error("Update error:", error);
        showError("Erreur d'affichage");
    }
}

function updatePlayersList(players, currentPlayerId) {
    const container = document.getElementById('players-list');
    container.innerHTML = '';

    Object.entries(players || {}).forEach(([id, player]) => {
        const playerEl = document.createElement('div');
        playerEl.className = `player-card ${id === currentPlayerId ? 'current-player' : ''} ${player.online ? '' : 'offline'}`;
        
        playerEl.innerHTML = `
            <div class="player-avatar">
                ${player.avatar ? `<img src="${player.avatar}" alt="${player.name}">` : '<i class="fas fa-user"></i>'}
            </div>
            <span class="player-name">${player.name}</span>
            <span class="player-status ${player.ready ? 'ready' : 'waiting'}">
                ${player.ready ? 'Prêt' : 'En attente'}
            </span>
            ${id === currentPlayerId ? '<span class="you-badge">(Vous)</span>' : ''}
            ${id === players.hostId ? '<i class="fas fa-crown host-icon"></i>' : ''}
        `;
        
        container.appendChild(playerEl);
    });
}

function updatePlayerCount(players) {
    const onlineCount = Object.values(players || {}).filter(p => p.online).length;
    document.querySelector('#player-count .count').textContent = onlineCount;
}

async function toggleReady(gameRef, playerRef) {
    const snapshot = await playerRef.once('value');
    const isReady = !snapshot.val().ready;
    await playerRef.update({ ready: isReady });
    
    const readyButton = document.getElementById('ready-button');
    const readyStatus = document.getElementById('ready-status');
    
    if (isReady) {
        readyButton.innerHTML = '<i class="fas fa-times"></i> Annuler';
        readyButton.className = 'btn btn-danger';
        readyStatus.textContent = 'En attente des autres joueurs...';
    } else {
        readyButton.innerHTML = '<i class="fas fa-check"></i> Prêt à boire !';
        readyButton.className = 'btn btn-success';
        readyStatus.textContent = 'Cliquez sur "Prêt" quand vous êtes prêt';
    }
}

async function startGame(gameRef, gameId) {
    try {
        const deck = createDeck();
        const gameSnapshot = await gameRef.once('value');
        const players = gameSnapshot.val().players;
        
        // Vérification 1: Au moins 2 joueurs
        if (Object.keys(players).length < 2) {
            showError("Il faut au moins 2 joueurs pour commencer !");
            return;
        }
        
        // Vérification 2: Tous les joueurs sont prêts
        const allReady = Object.values(players).every(p => p.ready && p.online);
        if (!allReady) {
            showError("Tous les joueurs doivent être prêts !");
            return;
        }

        // Création de la pyramide basée sur le nombre de joueurs
        const pyramid = createPyramid(Object.keys(players).length);
        
        await gameRef.update({
            status: "started",
            phase: "distribution",  // Première phase
            deck: deck,
            pyramid: pyramid,      // Ajout de la pyramide
            currentTurn: Object.keys(players)[0],  // Premier joueur
            startTime: firebase.database.ServerValue.TIMESTAMP
        });

        // Distribuer les cartes aux joueurs
        await distributeCards(gameRef, gameId, deck);

    } catch (error) {
        showError("Erreur: " + error.message);
        console.error("Start game error:", error);
    }
}
// Nouvelle fonction pour distribuer les cartes
async function distributeCards(gameRef, gameId, deck) {
    const gameSnapshot = await gameRef.once('value');
    const players = gameSnapshot.val().players;
    
    const updates = {};
    const playerIds = Object.keys(players);
    
    // 4 cartes par joueur
    playerIds.forEach(playerId => {
        updates[`players/${playerId}/cards`] = deck.splice(0, 4).map(card => ({
            ...card,
            revealed: false
        }));
    });
    
    updates['deck'] = deck; // Mise à jour du deck restant
    
    await gameRef.update(updates);
}

// Nouvelle fonction pour créer la pyramide
function createPyramid(playerCount) {
    const rows = Math.min(7, 3 + playerCount); // Entre 4 et 7 lignes
    const pyramid = [];
    const card = getRandomCard();
    
    for (let i = 0; i < rows; i++) {
        const row = Array(i + 1).fill().map(() => ({
            revealed: false,
            value: card.value,
            suit: card.suit
        }));
        pyramid.push(row);
    }
    
    return pyramid;
}

// Nouvelle fonction pour distribuer les cartes
async function distributeCards(gameRef, gameId, deck) {
    const gameSnapshot = await gameRef.once('value');
    const players = gameSnapshot.val().players;
    
    const updates = {};
    const playerIds = Object.keys(players);
    
    // 4 cartes par joueur
    playerIds.forEach(playerId => {
        updates[`players/${playerId}/cards`] = deck.splice(0, 4).map(card => ({
            ...card,
            revealed: false
        }));
    });
    
    updates['deck'] = deck; // Mise à jour du deck restant
    
    await gameRef.update(updates);
}

function checkAllPlayersReady(players) {
    const allPlayers = Object.values(players || {});
    return allPlayers.length >= 2 && 
           allPlayers.every(player => player.ready && player.online);
}

function createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit, value });
        }
    }
    
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit, value });
        }
    }
    
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function getRandomCard() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const value = values[Math.floor(Math.random() * values.length)];
    
    return { suit, value };
}

async function leaveGame(playerRef, gameId) {
    if (confirm("Quitter la partie ?")) {
        try {
            await playerRef.remove();
            window.location.href = 'index.html';
        } catch (error) {
            showError("Erreur: " + error.message);
        }
    }
}

function showError(message) {
    const el = document.getElementById('error-message');
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function redirectToIndex(reason) {
    console.warn("Redirection:", reason);
    window.location.href = 'index.html';
}
