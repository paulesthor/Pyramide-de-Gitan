document.addEventListener('DOMContentLoaded', () => {
    // Initialisation
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const playerId = urlParams.get('playerId');
    
    if (!gameId || !playerId) {
        window.location.href = 'index.html';
        return;
    }

    const db = window.db;
    const gameRef = db.ref(`games/${gameId}`);

    // Variables d'état
    let currentGame = {};
    let selectedCardIndex = null;
    let isProcessing = false;
    let previousSipsCount = 0; // Nouvelle variable pour suivre les gorgées précédentes

    // Références DOM
    const UI = {
        playerHand: document.getElementById('player-hand'),
        actionTitle: document.getElementById('action-title'),
        dynamicButtons: document.getElementById('dynamic-buttons'),
        contextualActions: document.getElementById('contextual-actions'),
        toast: document.getElementById('toast-notification'),
        toastContent: document.querySelector('.toast-content'),
        targetModal: document.getElementById('target-modal'),
        sipsCount: document.getElementById('sips-count'),
        targetPlayers: document.getElementById('target-players'),
        menuToggle: document.getElementById('menu-toggle'),
        sidebar: document.getElementById('mobile-sidebar'),
        closeSidebar: document.getElementById('close-sidebar'),
        playersContainer: document.getElementById('players-container'),
        chatInput: document.getElementById('chat-input-mobile'),
        sendChatBtn: document.getElementById('send-chat-mobile'),
        leaveGameBtn: document.getElementById('leave-game-mobile'),
        gameIdDisplay: document.getElementById('game-id-mobile'),
        currentTurnDisplay: document.getElementById('current-turn-mobile'),
        pyramidContainer: document.getElementById('pyramid-container')
    };

    // Initialisation des événements
    UI.menuToggle.addEventListener('click', () => UI.sidebar.classList.add('open'));
    UI.closeSidebar.addEventListener('click', () => UI.sidebar.classList.remove('open'));
    UI.sendChatBtn.addEventListener('click', sendChatMessage);
    UI.chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendChatMessage());
    UI.leaveGameBtn.addEventListener('click', handleLeaveGame);
    renderChatMessages();
    
    // Initialisation du suivi des gorgées
    setupSipsNotifications();

    // Écouteur Firebase
    gameRef.on('value', (snapshot) => {
        const newGameState = snapshot.val() || {};
        
        // Vérifier les changements de gorgées avant de mettre à jour currentGame
        checkSipsChanges(newGameState);
        
        currentGame = newGameState;
        updateGameUI();
        checkGameEnd();
    });

    function checkSipsChanges(newGameState) {
        if (!newGameState.players || !newGameState.players[playerId]) return;
        
        const newSips = newGameState.players[playerId].sipsToDrink || 0;
        const oldSips = currentGame.players?.[playerId]?.sipsToDrink || 0;
        
        if (newSips > oldSips) {
            const difference = newSips - oldSips;
            const giver = findSipsGiver(newGameState, playerId, difference);
            showSipsNotification(difference, giver);
        }
    }

    function setupSipsNotifications() {
        // Initialiser le compteur précédent
        previousSipsCount = currentGame.players?.[playerId]?.sipsToDrink || 0;
    }

    function findSipsGiver(gameState, receiverId, amount) {
        // Vérifie si l'information est stockée dans lastSipsFrom
        if (gameState.players[receiverId]?.lastSipsFrom) {
            return gameState.players[gameState.players[receiverId].lastSipsFrom]?.name || "un joueur";
        }
        // Fallback: utilise le joueur actuel
        return gameState.players?.[gameState.currentTurn]?.name || "un joueur";
    }

    function showSipsNotification(amount, giverName) {
        const message = `${giverName} vous a donné ${amount} gorgée${amount > 1 ? 's' : ''} à boire !`;
        showToast(message, 'error');
        
        // Animation visuelle supplémentaire
        const notification = document.createElement('div');
        notification.className = 'sips-notification';
        notification.innerHTML = `
            <i class="fas fa-glass-cheers"></i>
            <span>+${amount}</span>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 500);
            }, 2000);
        }, 100);
    }

    function updateGameUI() {
        renderPlayerCards();
        renderPyramid();
        renderPlayersList();
        updateGameInfo();
    }

    function renderPlayerCards() {
        UI.playerHand.innerHTML = '';
        const cards = currentGame.players?.[playerId]?.cards || [];
        const isPlayerTurn = currentGame.currentTurn === playerId;
        
        cards.forEach((card, index) => {
            const isRevealed = card.revealed;
            const isSelectable = !isRevealed && isPlayerTurn;
            
            const cardEl = document.createElement('div');
            cardEl.className = `player-card ${isRevealed ? 'revealed' : ''} ${isSelectable ? 'selectable' : ''}`;
            cardEl.dataset.index = index;
            
            cardEl.innerHTML = `
                <div class="card-inner">
                    <div class="card-front">
                        <div class="card-value">${card.value}</div>
                        <div class="card-suit">${getSuitSymbol(card.suit)}</div>
                    </div>
                    <div class="card-back">
                        <i class="fas fa-question"></i>
                    </div>
                </div>
            `;
            
            if (isSelectable) {
                cardEl.addEventListener('click', () => {
                    if (!currentGame.players[playerId]?.cards?.[index]?.revealed) {
                        selectCard(index);
                    }
                });
            }
            
            UI.playerHand.appendChild(cardEl);
        });
    }

    function selectCard(index) {
        if (isProcessing) return;
        
        if (currentGame.currentTurn !== playerId) {
            showToast("Ce n'est pas votre tour !", 'error');
            return;
        }

        if (!currentGame.players[playerId]?.cards?.[index] || 
            currentGame.players[playerId].cards[index].revealed) {
            return;
        }

        selectedCardIndex = index;
        const revealedCount = currentGame.players[playerId]?.cards?.filter(c => c.revealed).length || 0;
        const predictionStep = revealedCount + 1;
        
        showPredictionOptions(predictionStep);
    }

    async function checkGameEnd() {
        if (!currentGame.players) return;
        
        const allPlayers = Object.values(currentGame.players);
        const allCardsRevealed = allPlayers.every(player => 
            player.cards?.every(card => card.revealed)
        );
        
        if (allCardsRevealed && currentGame.phase === "distribution") {
            try {
                // Mettre à jour l'état de la carte de chaque joueur pour la phase 2
                const updatedPlayers = {};
                Object.entries(currentGame.players).forEach(([id, player]) => {
                    const playerCards = player.cards;
                    if (playerCards) {
                        updatedPlayers[id] = {
                            ...player,
                            cards: playerCards.map(card => ({ ...card, revealed: false }))
                        };
                    }
                });

                // Préparer les updates pour la base de données
                const updates = {
                    phase: "pyramid",
                    currentTurn: currentGame.hostId, // Donne le tour à l'hôte
                    players: updatedPlayers
                };

                // Passer à la phase pyramide et mettre à jour les cartes en une seule transaction
                await db.ref(`games/${gameId}`).update(updates);
                
                // Redirection vers la page de la phase 2
                window.location.href = `game2.html?gameId=${gameId}&playerId=${playerId}`;
            } catch (error) {
                console.error("Erreur lors du passage à la phase 2:", error);
                showToast("Erreur lors du changement de phase", 'error');
            }
        }
    }
    function renderPyramid() {
        UI.pyramidContainer.innerHTML = '';
        const pyramid = currentGame.pyramid || [];
        
        pyramid.forEach((row, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'pyramid-row';
            
            row.forEach((card, cardIndex) => {
                const cardEl = document.createElement('div');
                cardEl.className = `pyramid-card ${card.revealed ? 'revealed' : ''}`;
                
                if (card.revealed) {
                    cardEl.innerHTML = `
                        <div>${card.value}</div>
                        <div>${getSuitSymbol(card.suit)}</div>
                    `;
                } else {
                    cardEl.innerHTML = '<i class="fas fa-question"></i>';
                }
                
                rowEl.appendChild(cardEl);
            });
            
            UI.pyramidContainer.appendChild(rowEl);
        });
    }

    function renderPlayersList() {
        UI.playersContainer.innerHTML = '';
        
        Object.entries(currentGame.players || {}).forEach(([id, player]) => {
            const playerEl = document.createElement('div');
            playerEl.className = `player-item ${id === currentGame.hostId ? 'player-host' : ''} ${id === currentGame.currentTurn ? 'player-current' : ''}`;
            
            playerEl.innerHTML = `
                <div class="player-avatar">
                    ${player.avatar ? `<img src="${player.avatar}" alt="${player.name}">` : '<i class="fas fa-user"></i>'}
                </div>
                <span class="player-name">${player.name}${id === playerId ? ' (Vous)' : ''}</span>
                <span class="player-status">${player.cards?.filter(c => !c.revealed).length || 0} cartes</span>
                ${player.sipsToDrink ? `<span class="sips-badge">${player.sipsToDrink} gorgées</span>` : ''}
            `;
            
            UI.playersContainer.appendChild(playerEl);
        });
    }

    function updateGameInfo() {
        UI.gameIdDisplay.textContent = currentGame.gameCode || gameId.slice(0, 6);
        UI.currentTurnDisplay.textContent = currentGame.players?.[currentGame.currentTurn]?.name || 'Chargement...';
    }

    function showPredictionOptions(step) {
        UI.actionTitle.textContent = getPredictionTitle(step);
        UI.dynamicButtons.innerHTML = getPredictionButtons(step);
        
        document.querySelectorAll('.prediction-btn').forEach(btn => {
            btn.addEventListener('click', handlePrediction);
        });
        
        UI.contextualActions.classList.add('visible');
    }

    async function handlePrediction(event) {
        if (isProcessing) return;
        isProcessing = true;

        const button = event.currentTarget;
        const choice = button.dataset.choice;
        const card = currentGame.players[playerId].cards[selectedCardIndex];
        const revealedCount = currentGame.players[playerId]?.cards?.filter(c => c.revealed).length || 0;
        const predictionStep = revealedCount + 1;
        const isCorrect = checkPrediction(choice, card, predictionStep);

        // Animation
        const cardElement = document.querySelector(`.player-card[data-index="${selectedCardIndex}"]`);
        cardElement.classList.add('revealed');
        button.classList.add('processing');

        // Mise à jour Firebase
        const updates = {
            [`players/${playerId}/cards/${selectedCardIndex}/revealed`]: true
        };

        try {
            if (isCorrect) {
                const sips = predictionStep;
                showToast(`✅ Bonne réponse ! Distribuez ${sips} gorgée(s)`, 'success');
                await gameRef.update(updates);
                await new Promise(resolve => setTimeout(resolve, 1000));
                showTargetModal(sips);
            } else {
                updates[`players/${playerId}/sipsToDrink`] = (currentGame.players[playerId]?.sipsToDrink || 0) + 1;
                updates[`players/${playerId}/lastSipsFrom`] = currentGame.currentTurn;
                updates[`players/${playerId}/lastSipsAmount`] = 1;
                await gameRef.update(updates);
                showToast(`❌ Mauvaise réponse ! Tu bois 1 gorgée`, 'error');
            }

            await passTurn();
        } catch (error) {
            console.error("Erreur:", error);
            showToast("Une erreur est survenue", 'error');
        } finally {
            UI.contextualActions.classList.remove('visible');
            isProcessing = false;
            updateGameUI();
        }
    }

    async function passTurn() {
        const playerIds = Object.keys(currentGame.players);
        const currentIndex = playerIds.indexOf(currentGame.currentTurn);
        let nextIndex = (currentIndex + 1) % playerIds.length;
        let nextPlayerFound = false;
        let attempts = 0;

        while (attempts < playerIds.length && !nextPlayerFound) {
            const nextPlayerId = playerIds[nextIndex];
            const playerCards = currentGame.players[nextPlayerId]?.cards || [];
            const unrevealedCards = playerCards.filter(card => !card.revealed).length;
            
            if (unrevealedCards > 0) {
                await gameRef.update({
                    currentTurn: nextPlayerId
                });
                nextPlayerFound = true;
            }
            
            nextIndex = (nextIndex + 1) % playerIds.length;
            attempts++;
        }

        if (!nextPlayerFound) {
            showToast("La partie est terminée !", 'success');
        }
    }

    function showTargetModal(sips) {
        UI.targetModal.classList.remove('hidden');
        UI.sipsCount.textContent = sips;
        UI.targetPlayers.innerHTML = '';

        Object.entries(currentGame.players || {}).forEach(([id, player]) => {
            if (id !== playerId) {
                const playerEl = document.createElement('button');
                playerEl.className = 'target-player';
                playerEl.innerHTML = `
                    <span>${player.name}</span>
                    <small>${player.sipsToDrink || 0} gorgées</small>
                `;
                playerEl.addEventListener('click', async () => {
                    playerEl.classList.add('selected');
                    const updates = {
                        [`players/${id}/sipsToDrink`]: (currentGame.players[id]?.sipsToDrink || 0) + sips,
                        [`players/${id}/lastSipsFrom`]: playerId,
                        [`players/${id}/lastSipsAmount`]: sips
                    };
                    
                    await gameRef.update(updates);
                    
                    // Ajout du message dans le chat
                    const chatRef = db.ref(`games/${gameId}/chat`);
                    const currentPlayerName = currentGame.players[playerId]?.name || "Vous";
                    const targetPlayerName = currentGame.players[id]?.name || "un joueur";
                    
                    chatRef.push({
                        playerId: "system",
                        playerName: "Système",
                        avatar: "",
                        message: `${currentPlayerName} a donné ${sips} gorgée${sips > 1 ? 's' : ''} à ${targetPlayerName}`,
                        timestamp: Date.now(),
                        isSystem: true
                    });
                    
                    UI.targetModal.classList.add('hidden');
                });
                UI.targetPlayers.appendChild(playerEl);
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'target-player cancel-btn';
        cancelBtn.textContent = 'Annuler';
        cancelBtn.addEventListener('click', () => UI.targetModal.classList.add('hidden'));
        UI.targetPlayers.appendChild(cancelBtn);
    }

    function checkPrediction(choice, card, step) {
        const cardValue = getCardValue(card.value);
        const isRed = ['hearts', 'diamonds'].includes(card.suit);
        
        switch(step) {
            case 1: return (choice === 'red' && isRed) || (choice === 'black' && !isRed);
            case 2: 
                const firstCard = currentGame.players[playerId].cards.find(c => c.revealed);
                if (!firstCard) return true;
                const firstValue = getCardValue(firstCard.value);
                return (choice === 'higher' && cardValue > firstValue) || 
                       (choice === 'lower' && cardValue < firstValue);
            case 3:
                const revealedCards = currentGame.players[playerId].cards.filter(c => c.revealed);
                if (revealedCards.length < 2) return true;
                const [first, second] = revealedCards.slice(-2).map(c => getCardValue(c.value));
                const min = Math.min(first, second);
                const max = Math.max(first, second);
                return (choice === 'between' && cardValue > min && cardValue < max) ||
                       (choice === 'outside' && (cardValue < min || cardValue > max));
            case 4: return choice === card.suit;
            default: return false;
        }
    }

    function getPredictionTitle(step) {
        const titles = {
            1: "La carte est rouge ou noire ?",
            2: "Plus haute ou plus basse que la précédente ?",
            3: "Entre ou dehors les 2 dernières ?",
            4: "Quelle est la famille de la carte ?"
        };
        return titles[step] || "Fais ta prédiction";
    }

    function getPredictionButtons(step) {
        const buttons = {
            1: [
                { class: 'btn-red', choice: 'red', text: 'Rouge' },
                { class: 'btn-black', choice: 'black', text: 'Noire' }
            ],
            2: [
                { class: 'btn-higher', choice: 'higher', text: 'Plus haute' },
                { class: 'btn-lower', choice: 'lower', text: 'Plus basse' }
            ],
            3: [
                { class: 'btn-between', choice: 'between', text: 'Entre' },
                { class: 'btn-outside', choice: 'outside', text: 'Dehors' }
            ],
            4: [
                { class: 'btn-suit hearts', choice: 'hearts', text: '♥ Cœur' },
                { class: 'btn-suit diamonds', choice: 'diamonds', text: '♦ Carreau' },
                { class: 'btn-suit clubs', choice: 'clubs', text: '♣ Trèfle' },
                { class: 'btn-suit spades', choice: 'spades', text: '♠ Pique' }
            ]
        };
        
        return (buttons[step] || []).map(btn => `
            <button class="dynamic-btn prediction-btn ${btn.class}" data-choice="${btn.choice}">
                ${btn.text}
            </button>
        `).join('');
    }
    
    function showToast(message, type = 'info') {
        UI.toastContent.innerHTML = message;
        UI.toast.className = `toast ${type}`;
        UI.toast.classList.add('show');
        
        setTimeout(() => {
            UI.toast.classList.remove('show');
        }, 3000);
    }

    function sendChatMessage() {
        const message = UI.chatInput.value.trim();
        if (message) {
            const chatRef = db.ref(`games/${gameId}/chat`);
            chatRef.push({
                playerId: playerId,
                playerName: currentGame.players[playerId]?.name || 'Anonyme',
                avatar: currentGame.players[playerId]?.avatar || '',
                message: message,
                timestamp: Date.now()
            });
            UI.chatInput.value = '';
        }
    }

    function renderChatMessages() {
        const chatRef = db.ref(`games/${gameId}/chat`);
        chatRef.on('value', (snapshot) => {
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.innerHTML = '';
            
            snapshot.forEach((childSnapshot) => {
                const msg = childSnapshot.val();
                const messageEl = document.createElement('div');
                messageEl.className = `chat-message ${msg.isSystem ? 'system-message' : ''}`;
                
                if (msg.isSystem) {
                    messageEl.innerHTML = `
                        <div class="chat-content system">
                            <div class="chat-text">${msg.message}</div>
                            <div class="chat-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                    `;
                } else {
                    messageEl.innerHTML = `
                        <div class="chat-avatar">
                            ${msg.avatar ? `<img src="${msg.avatar}" alt="${msg.playerName}">` : '<i class="fas fa-user"></i>'}
                        </div>
                        <div class="chat-content">
                            <div class="chat-sender">${msg.playerName}</div>
                            <div class="chat-text">${msg.message}</div>
                            <div class="chat-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                    `;
                }
                
                messagesContainer.appendChild(messageEl);
            });
            
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    }
    

    async function handlePyramidCardClick(event) {
        if (isProcessing || currentGame.currentTurn !== playerId) return;

        const cardEl = event.currentTarget;
        const rowIndex = parseInt(cardEl.dataset.row);
        const cardIndex = parseInt(cardEl.dataset.index);
        const sips = rowIndex + 1;

        // Afficher le modal avec les joueurs cibles
        UI.targetModal.classList.remove('hidden');
        UI.sipsCount.textContent = sips;
        UI.targetPlayers.innerHTML = '';

        Object.entries(currentGame.players || {}).forEach(([id, player]) => {
            if (id !== playerId) {
                const playerEl = document.createElement('button');
                playerEl.className = 'target-player';
                playerEl.innerHTML = `
                    <span>${player.name}</span>
                    <small>${player.sipsToDrink || 0} gorgées</small>
                `;
                playerEl.addEventListener('click', async () => {
                    isProcessing = true;
                    UI.targetModal.classList.add('hidden');

                    try {
                        const updates = {
                            [`pyramid/${rowIndex}/${cardIndex}/revealed`]: true,
                            [`players/${id}/sipsToDrink`]: (currentGame.players[id]?.sipsToDrink || 0) + sips,
                            [`players/${id}/lastSipsFrom`]: playerId,
                            [`players/${id}/lastSipsAmount`]: sips
                        };
                        
                        await gameRef.update(updates);

                        // Message dans le chat
                        const chatRef = db.ref(`games/${gameId}/chat`);
                        const currentPlayerName = currentGame.players[playerId]?.name || "Vous";
                        const targetPlayerName = currentGame.players[id]?.name || "un joueur";
                        
                        chatRef.push({
                            playerId: "system",
                            playerName: "Système",
                            avatar: "",
                            message: `${currentPlayerName} a donné ${sips} gorgée${sips > 1 ? 's' : ''} à ${targetPlayerName} depuis la pyramide`,
                            timestamp: Date.now(),
                            isSystem: true
                        });

                        showToast(`✅ ${sips} gorgée(s) données à ${targetPlayerName}`, 'success');
                        await passTurn();
                    } catch (error) {
                        console.error("Erreur:", error);
                        showToast("Une erreur est survenue", 'error');
                    } finally {
                        isProcessing = false;
                    }
                });
                UI.targetPlayers.appendChild(playerEl);
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'target-player cancel-btn';
        cancelBtn.textContent = 'Annuler';
        cancelBtn.addEventListener('click', () => UI.targetModal.classList.add('hidden'));
        UI.targetPlayers.appendChild(cancelBtn);
    }

    function handleLeaveGame() {
        if (confirm("Voulez-vous vraiment quitter la partie ?")) {
            db.ref(`games/${gameId}/players/${playerId}`).remove()
                .then(() => window.location.href = 'index.html')
                .catch(error => showToast("Erreur: " + error.message, 'error'));
        }
    }

    function getCardValue(value) {
        const values = {'A': 1, 'J': 11, 'Q': 12, 'K': 13};
        return values[value] || parseInt(value);
    }

    function getSuitSymbol(suit) {
        const symbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return symbols[suit] || suit;
    }
});