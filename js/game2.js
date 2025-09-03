document.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] Game2 initialized - DOM fully loaded');
    
    // Get game parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const playerId = urlParams.get('playerId');
    
    console.log(`[DEBUG] Game ID: ${gameId}, Player ID: ${playerId}`);
    
    if (!gameId || !playerId) {
        console.error('[ERROR] Missing gameId or playerId - redirecting to index');
        window.location.href = 'index.html';
        return;
    }

    const db = window.db;
    const gameRef = db.ref(`games/${gameId}`);
    console.log('[DEBUG] Firebase references initialized');

    // Game state variables
    let currentGame = {};
    let isProcessing = false;

    // UI Elements
    const UI = {
        pyramidContainer: document.getElementById('pyramid-container'),
        toast: document.getElementById('toast-notification'),
        toastContent: document.querySelector('.toast-content'),
        playersContainer: document.getElementById('players-container'),
        chatInput: document.getElementById('chat-input-mobile'),
        sendChatBtn: document.getElementById('send-chat-mobile'),
        currentTurnDisplay: document.getElementById('current-turn-mobile'),
        gameIdDisplay: document.getElementById('game-id-mobile'),
        menuToggle: document.getElementById('menu-toggle'),
        sidebar: document.getElementById('mobile-sidebar'),
        closeSidebar: document.getElementById('close-sidebar'),
        leaveBtn: document.getElementById('leave-game-mobile'),
        playersCardsContainer: document.getElementById('players-cards-container') // CORRECTION ICI
    };

    console.log('[DEBUG] UI elements initialized:', UI);

    // Initialize event listeners
    function initEventListeners() {
        console.log('[DEBUG] Initializing event listeners');
        
        UI.menuToggle.addEventListener('click', () => {
            console.log('[DEBUG] Menu toggle clicked');
            UI.sidebar.classList.add('open');
        });
        
        UI.closeSidebar.addEventListener('click', () => {
            console.log('[DEBUG] Close sidebar clicked');
            UI.sidebar.classList.remove('open');
        });
        
        UI.sendChatBtn.addEventListener('click', sendChatMessage);
        UI.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
        
        UI.leaveBtn.addEventListener('click', handleLeaveGame);
        
        console.log('[DEBUG] Event listeners initialized');
    }

    // Firebase listener for game updates
    function setupGameListener() {
        console.log('[DEBUG] Setting up Firebase game listener');
        
        gameRef.on('value', (snapshot) => {
            console.log('[DEBUG] Firebase game update received');
            const newGameState = snapshot.val() || {};
            
            // VÉRIFIER SI LA PYRAMIDE A RÉELLEMENT CHANGÉ
            const oldPyramidStr = JSON.stringify(currentGame.pyramid);
            const newPyramidStr = JSON.stringify(newGameState.pyramid);
            const pyramidChanged = oldPyramidStr !== newPyramidStr;
            
            // VÉRIFIER SI LES CARTES JOUEURS ONT CHANGÉ
            const oldPlayersStr = JSON.stringify(currentGame.players);
            const newPlayersStr = JSON.stringify(newGameState.players);
            const playersChanged = oldPlayersStr !== newPlayersStr;
            
            currentGame = newGameState;
            
            console.log('[DEBUG] Pyramid changed:', pyramidChanged);
            console.log('[DEBUG] Players changed:', playersChanged);
            
            if (!currentGame.phase || currentGame.phase !== "pyramid") {
                console.log('[DEBUG] Wrong phase - redirecting to game.html');
                window.location.href = `game.html?gameId=${gameId}&playerId=${playerId}`;
                return;
            }
            
            // RE-RENDRE UNIQUEMENT SI LA PYRAMIDE A CHANGÉ
            if (pyramidChanged) {
                console.log('[DEBUG] Re-rendering pyramid (changes detected)');
                renderPyramid();
            }
            
            // RE-RENDRE LES CARTES JOUEURS SI ELLES ONT CHANGÉ
            if (playersChanged) {
                console.log('[DEBUG] Re-rendering players cards (changes detected)');
                renderAllPlayersCards();
            }
            
            renderPlayersList();
            updateGameInfo();
        });
    }

    // Render the pyramid cards
    function renderPyramid() {
        console.log('[DEBUG] Rendering pyramid');
        
        if (!UI.pyramidContainer) {
            console.error('[ERROR] Pyramid container not found!');
            return;
        }
        
        UI.pyramidContainer.innerHTML = '';
        const pyramid = currentGame.pyramid || [];
        console.log(`[DEBUG] Pyramid has ${pyramid.length} rows`);
        
        pyramid.forEach((row, rowIndex) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'pyramid-row';
            rowEl.style.display = 'flex';
            rowEl.style.justifyContent = 'center';
            rowEl.style.marginBottom = '10px';
            
            row.forEach((card, cardIndex) => {
                console.log(`[DEBUG] Card [${rowIndex}][${cardIndex}]: revealed:${card.revealed}, value:${card.value}, suit:${card.suit}`);
                
                const cardEl = document.createElement('div');
                cardEl.className = `pyramid-card`;
                cardEl.dataset.row = rowIndex;
                cardEl.dataset.index = cardIndex;
                
                // Style de base pour toutes les cartes
                cardEl.style.display = 'flex';
                cardEl.style.justifyContent = 'center';
                cardEl.style.alignItems = 'center';
                cardEl.style.width = '60px';
                cardEl.style.height = '80px';
                cardEl.style.margin = '5px';
                cardEl.style.padding = '10px';
                cardEl.style.border = '2px solid #ccc';
                cardEl.style.borderRadius = '8px';
                cardEl.style.fontSize = '20px';
                cardEl.style.fontWeight = 'bold';
                cardEl.style.boxSizing = 'border-box';
                
                if (card.revealed) {
                    // CARTE RÉVÉLÉE - Affichage simple: chiffre + symbole à droite
                    cardEl.innerHTML = `
                        <span style="margin-right: 5px;">${card.value}</span>
                        <span>${getSuitSymbol(card.suit)}</span>
                    `;
                    cardEl.style.backgroundColor = 'white';
                    cardEl.style.color = ['hearts', 'diamonds'].includes(card.suit) ? 'red' : 'black';
                    cardEl.style.cursor = 'default';
                } else {
                    // CARTE CACHÉE - Afficher un point d'interrogation
                    cardEl.innerHTML = `<i class="fas fa-question"></i>`;
                    cardEl.style.backgroundColor = '#f0f0f0';
                    cardEl.style.color = '#666';
                    
                    // Seul l'hôte peut cliquer sur les cartes non révélées
                    if (currentGame.hostId === playerId) {
                        cardEl.style.cursor = 'pointer';
                        cardEl.addEventListener('click', () => handlePyramidCardClick(rowIndex, cardIndex));
                    } else {
                        cardEl.style.cursor = 'default';
                    }
                }
                
                rowEl.appendChild(cardEl);
            });
            
            UI.pyramidContainer.appendChild(rowEl);
        });
        
        console.log('[DEBUG] Pyramid rendered with', document.querySelectorAll('.pyramid-card').length, 'cards');
    }

    // Render all players cards (face cachée) for phase 2
    function renderAllPlayersCards() {
        console.log('[DEBUG] Rendering all players cards for phase 2');
        console.log('[DEBUG] Current players data:', currentGame.players); // Ligne de débogage ajoutée
        if (!UI.playersCardsContainer) {
            console.error('[ERROR] Players cards container not found!');
            return;
        }

        console.log('[DEBUG] Rendering all players cards for phase 2');
        
        if (!UI.playersCardsContainer) {
            console.error('[ERROR] Players cards container not found!');
            return;
        }
        
        // Appliquer le style au conteneur
        UI.playersCardsContainer.style.margin = '20px 0';
        UI.playersCardsContainer.style.padding = '15px';
        UI.playersCardsContainer.style.backgroundColor = '#f8f9fa';
        UI.playersCardsContainer.style.borderRadius = '10px';
        
        UI.playersCardsContainer.innerHTML = '';
        const players = currentGame.players || {};
        
        Object.entries(players).forEach(([id, player]) => {
            console.log(`[DEBUG] Rendering cards for player: ${player.name}`);
            
            const playerSection = document.createElement('div');
            playerSection.className = 'player-cards-section';
            playerSection.style.marginBottom = '25px';
            
            // Nom du joueur
            const playerName = document.createElement('h3');
            playerName.textContent = `${player.name}${id === playerId ? ' (Vous)' : ''}`;
            playerName.style.marginBottom = '10px';
            playerName.style.color = '#333';
            playerName.style.fontSize = '16px';
            playerName.style.textAlign = 'center';
            playerSection.appendChild(playerName);
            
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'player-cards-container';
            cardsContainer.style.display = 'flex';
            cardsContainer.style.justifyContent = 'center';
            cardsContainer.style.gap = '10px';
            cardsContainer.style.flexWrap = 'wrap';
            
            // Afficher les 4 cartes du joueur (toujours face cachée en phase 2)
            if (player.cards && Array.isArray(player.cards)) {
                player.cards.forEach((card, index) => {
                    const cardEl = document.createElement('div');
                    cardEl.className = 'player-card';
                    cardEl.style.width = '60px';
                    cardEl.style.height = '80px';
                    cardEl.style.perspective = '1000px';
                    
                    // Toujours face cachée en phase 2
                    cardEl.innerHTML = `
                        <div class="card-inner" style="width: 100%; height: 100%; position: relative; transform-style: preserve-3d;">
                            <div class="card-back" style="width: 100%; height: 100%; background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%); backface-visibility: hidden; position: absolute; top: 0; left: 0; border-radius: 8px; display: flex; justify-content: center; align-items: center; color: white; font-size: 24px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); border: 2px solid #fff;">
                                <i class="fas fa-question"></i>
                            </div>
                        </div>
                    `;
                    
                    cardsContainer.appendChild(cardEl);
                });
            }
            
            playerSection.appendChild(cardsContainer);
            UI.playersCardsContainer.appendChild(playerSection);
        });
    }

    // Handle pyramid card clicks
    async function handlePyramidCardClick(rowIndex, cardIndex) {
        console.log(`[DEBUG] Card clicked at row ${rowIndex}, index ${cardIndex}`);
        
        if (isProcessing) {
            console.log('[DEBUG] Already processing - ignoring click');
            return;
        }
        
        if (currentGame.hostId !== playerId) {
            console.log('[DEBUG] Not host - ignoring click');
            return;
        }

        const cardEl = document.querySelector(`.pyramid-card[data-row="${rowIndex}"][data-index="${cardIndex}"]`);
        if (!cardEl) {
            console.error('[ERROR] Card element not found!');
            return;
        }
        
        // Vérifier si la carte est déjà révélée dans les données
        if (currentGame.pyramid?.[rowIndex]?.[cardIndex]?.revealed) {
            console.log('[DEBUG] Card already revealed in data - ignoring click');
            return;
        }
        
        isProcessing = true;
        console.log('[DEBUG] Starting card reveal process...');
        
        try {
            // Récupérer la prochaine carte du deck
            const nextCard = currentGame.deck?.[0];
            if (!nextCard) {
                throw new Error("Plus de cartes dans le deck!");
            }
            
            const sips = rowIndex + 1;
            console.log(`[DEBUG] Next card from deck:`, nextCard, `Sips: ${sips}`);
            
            // Mise à jour Firebase
            const updates = {
                [`pyramid/${rowIndex}/${cardIndex}/revealed`]: true,
                [`pyramid/${rowIndex}/${cardIndex}/value`]: nextCard.value,
                [`pyramid/${rowIndex}/${cardIndex}/suit`]: nextCard.suit,
                'deck': currentGame.deck?.slice(1) || []
            };
            
            console.log('[DEBUG] Updating Firebase with:', updates);
            await gameRef.update(updates);
            console.log('[DEBUG] Firebase update completed');
            
            // NE PAS METTRE À JOUR L'UI ICI - Firebase déclenchera un re-rendu
            
            // Message dans le chat
            const chatRef = db.ref(`games/${gameId}/chat`);
            const currentPlayerName = currentGame.players[playerId]?.name || "L'hôte";
            const chatMessage = `${currentPlayerName} a révélé une carte (${nextCard.value} ${getSuitSymbol(nextCard.suit)}) - ${sips} gorgée${sips > 1 ? 's' : ''} en jeu`;
            
            console.log('[DEBUG] Sending chat message:', chatMessage);
            await chatRef.push({
                playerId: "system",
                playerName: "Système",
                avatar: "",
                message: chatMessage,
                timestamp: Date.now(),
                isSystem: true
            });
            
            console.log('[DEBUG] Card reveal process completed successfully');

        } catch (error) {
            console.error('[ERROR] During card reveal:', error);
            showToast("Erreur lors de la révélation: " + error.message, 'error');
        } finally {
            isProcessing = false;
        }
    }

    function renderPlayersList() {
        console.log('[DEBUG] Rendering players list');
        
        if (!UI.playersContainer) {
            console.error('[ERROR] Players container not found!');
            return;
        }
        
        UI.playersContainer.innerHTML = '';
        const players = currentGame.players || {};
        
        Object.entries(players).forEach(([id, player]) => {
            console.log(`[DEBUG] Rendering player: ${player.name} (${id})`);
            
            const playerEl = document.createElement('div');
            playerEl.className = `player-item ${id === currentGame.hostId ? 'player-host' : ''} ${id === currentGame.currentTurn ? 'player-current' : ''}`;
            
            playerEl.innerHTML = `
                <div class="player-avatar">
                    ${player.avatar ? `<img src="${player.avatar}" alt="${player.name}">` : '<i class="fas fa-user"></i>'}
                </div>
                <span class="player-name">${player.name}${id === playerId ? ' (Vous)' : ''}</span>
                ${player.sipsToDrink ? `<span class="sips-badge">${player.sipsToDrink} gorgées</span>` : ''}
            `;
            
            UI.playersContainer.appendChild(playerEl);
        });
    }

    // Update game info display
    function updateGameInfo() {
        console.log('[DEBUG] Updating game info display');
        
        if (UI.gameIdDisplay) {
            UI.gameIdDisplay.textContent = currentGame.gameCode || gameId.slice(0, 6);
        }
        
        if (UI.currentTurnDisplay) {
            UI.currentTurnDisplay.textContent = currentGame.players?.[currentGame.currentTurn]?.name || 'Chargement...';
        }
    }

    // Handle chat messages
    function sendChatMessage() {
        const message = UI.chatInput.value.trim();
        if (!message) return;
        
        console.log('[DEBUG] Sending chat message:', message);
        
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

    // Render chat messages
    function renderChatMessages() {
        console.log('[DEBUG] Setting up chat messages listener');
        
        const chatRef = db.ref(`games/${gameId}/chat`);
        chatRef.on('value', (snapshot) => {
            console.log('[DEBUG] New chat messages received');
            
            const messagesContainer = document.getElementById('chat-messages');
            if (!messagesContainer) {
                console.error('[ERROR] Chat messages container not found!');
                return;
            }
            
            messagesContainer.innerHTML = '';
            
            snapshot.forEach((childSnapshot) => {
                const msg = childSnapshot.val();
                console.log('[DEBUG] Rendering chat message:', msg);
                
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

    // Helper: Get suit symbol
    function getSuitSymbol(suit) {
        const symbols = {
            'hearts': '♥', 'diamonds': '♦', 
            'clubs': '♣', 'spades': '♠'
        };
        return symbols[suit] || suit;
    }

    // Show toast notification
    function showToast(message, type = 'success') {
        console.log(`[DEBUG] Showing toast: ${message} (type: ${type})`);
        
        if (!UI.toast || !UI.toastContent) {
            console.error('[ERROR] Toast elements not found!');
            return;
        }
        
        UI.toastContent.textContent = message;
        UI.toast.className = `toast ${type}`;
        UI.toast.classList.add('show');
        
        setTimeout(() => {
            UI.toast.classList.remove('show');
        }, 3000);
    }

    // Handle leaving the game
    function handleLeaveGame() {
        console.log('[DEBUG] Leave game button clicked');
        
        if (confirm("Voulez-vous vraiment quitter la partie ?")) {
            console.log('[DEBUG] User confirmed leaving the game');
            
            db.ref(`games/${gameId}/players/${playerId}`).remove()
                .then(() => {
                    console.log('[DEBUG] Player removed successfully - redirecting to index');
                    window.location.href = 'index.html';
                })
                .catch(error => {
                    console.error('[ERROR] Failed to remove player:', error);
                    showToast("Erreur: " + error.message, 'error');
                });
        }
    }

    // Initialize the game
    initEventListeners();
    setupGameListener();
    renderChatMessages();
    renderAllPlayersCards(); // Afficher les cartes au chargement initial
    console.log('[DEBUG] Game initialization complete');
});