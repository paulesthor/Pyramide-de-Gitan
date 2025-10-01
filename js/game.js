document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const playerId = urlParams.get('playerId');
    
    if (!gameId || !playerId || !window.db) { window.location.href = 'index.html'; return; }

    const db = window.db;
    const gameRef = db.ref(`games/${gameId}`);
    let currentGame = {};
    let isProcessing = false;

    const UI = {
        playerHand: document.getElementById('player-hand'),
        pyramidContainer: document.getElementById('pyramid-container'),
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
    };

    UI.menuToggle.addEventListener('click', () => UI.sidebar.classList.add('open'));
    UI.closeSidebar.addEventListener('click', () => UI.sidebar.classList.remove('open'));
    UI.sendChatBtn.addEventListener('click', sendChatMessage);
    UI.chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendChatMessage());
    UI.leaveGameBtn.addEventListener('click', handleLeaveGame);
    
    gameRef.on('value', handleGameUpdate);
    db.ref(`games/${gameId}/chat`).on('child_added', renderChatMessage);

    function handleGameUpdate(snapshot) {
        const newGameState = snapshot.val();
        if (!newGameState || !newGameState.players || !newGameState.players[playerId]) { window.location.href = 'index.html'; return; }
        const oldSips = currentGame.players?.[playerId]?.sipsToDrink || 0;
        currentGame = newGameState;
        const newSips = currentGame.players[playerId].sipsToDrink || 0;
        if (newSips > oldSips) { showToast(`Vous avez reçu ${newSips - oldSips} gorgée(s) !`, 'error'); }
        const allCardsRevealed = Object.values(currentGame.players).every(p => p.cards?.every(c => c.revealed));
        if (allCardsRevealed && currentGame.phase === "distribution" && currentGame.hostId === playerId) { gameRef.update({ phase: "pyramid" }); return; }
        if (currentGame.phase === "pyramid") { window.location.href = `game2.html?gameId=${gameId}&playerId=${playerId}`; return; }
        renderGameUI();
    }
    
    function renderGameUI() {
        renderPlayerCards();
        renderPyramidPreview();
        renderPlayersList();
        updateGameInfo();
        const isMyTurn = currentGame.currentTurn === playerId;
        const hasUnrevealedCards = currentGame.players[playerId]?.cards?.some(c => !c.revealed);
        if (isMyTurn && hasUnrevealedCards) { showPredictionOptions(); } else { UI.contextualActions.classList.remove('visible'); }
    }

    // CORRECTION ICI : Assure que l'avatar est bien un fond d'image
    function renderPlayerCards() {
        UI.playerHand.innerHTML = '';
        const myPlayer = currentGame.players[playerId];
        const myCards = myPlayer?.cards || [];
        const myAvatar = myPlayer?.avatar || '';

        myCards.forEach((card) => {
            const cardEl = document.createElement('div');
            cardEl.className = `pyramid-card ${card.revealed ? 'revealed' : ''}`;
            const isRed = ['hearts', 'diamonds'].includes(card.suit);
            const suitSymbol = getSuitSymbol(card.suit);
            
            // On s'assure que si l'avatar est vide, on n'ajoute pas de style d'image
            const backStyle = myAvatar ? `style="background-image: url('${myAvatar}')"` : '';
            
            cardEl.innerHTML = `
                <div class="card-inner">
                    <div class="card-front ${isRed ? 'red' : 'black'}">
                        <div class="corner top-left"><span class="value">${card.value}</span><span class="suit">${suitSymbol}</span></div>
                        <div class="suit-center">${suitSymbol}</div>
                        <div class="corner bottom-right"><span class="value">${card.value}</span><span class="suit">${suitSymbol}</span></div>
                    </div>
                    <div class="card-back" ${backStyle}></div>
                </div>`;
            UI.playerHand.appendChild(cardEl);
        });
    }

    async function handlePrediction(choice) {
        if (isProcessing) return;
        isProcessing = true;
        UI.contextualActions.classList.remove('visible');
        const myCards = currentGame.players[playerId].cards;
        const cardToRevealIndex = myCards.findIndex(c => !c.revealed);
        const cardToReveal = myCards[cardToRevealIndex];
        const step = cardToRevealIndex + 1;
        const isCorrect = checkPrediction(choice, cardToReveal, step, myCards);
        await gameRef.update({ [`players/${playerId}/cards/${cardToRevealIndex}/revealed`]: true });
        if (isCorrect) {
            showToast(`Bonne réponse ! Donnez ${step} gorgée(s).`, 'success');
            showTargetModal(step);
        } else {
            const sipsToDrink = (currentGame.players[playerId].sipsToDrink || 0) + step;
            showToast(`Mauvaise réponse ! Vous buvez ${step} gorgée(s).`, 'error');
            await passTurn({ [`players/${playerId}/sipsToDrink`]: sipsToDrink });
        }
    }
    
    function showTargetModal(sips) {
        UI.sipsCount.textContent = sips;
        UI.targetPlayers.innerHTML = '';
        Object.entries(currentGame.players).forEach(([id, player]) => {
            if (id !== playerId) {
                const btn = document.createElement('button');
                btn.className = 'target-btn';
                btn.textContent = player.name;
                btn.onclick = () => assignSips(id, sips);
                UI.targetPlayers.appendChild(btn);
            }
        });
        UI.targetModal.classList.remove('hidden');
    }

    async function assignSips(targetId, sips) {
        UI.targetModal.classList.add('hidden');
        const targetSips = (currentGame.players[targetId].sipsToDrink || 0) + sips;
        showToast(`Vous avez donné ${sips} gorgée(s) à ${currentGame.players[targetId].name}.`, 'info');
        await passTurn({ [`players/${targetId}/sipsToDrink`]: targetSips });
    }

    async function passTurn(additionalUpdates = {}) {
        const playerIds = Object.keys(currentGame.players).sort();
        const currentIndex = playerIds.indexOf(currentGame.currentTurn);
        let nextIndex = (currentIndex + 1) % playerIds.length;
        let nextPlayerId = playerIds[nextIndex];
        let attempts = 0;
        while(currentGame.players[nextPlayerId].cards.every(c => c.revealed) && attempts < playerIds.length) {
            nextIndex = (nextIndex + 1) % playerIds.length;
            nextPlayerId = playerIds[nextIndex];
            attempts++;
        }
        const updates = { ...additionalUpdates, currentTurn: nextPlayerId };
        await gameRef.update(updates);
        isProcessing = false;
    }

    function renderPyramidPreview() { UI.pyramidContainer.innerHTML = ''; (currentGame.pyramid || []).forEach(row => { const rowEl = document.createElement('div'); rowEl.className = 'pyramid-row'; row.forEach(() => { const cardEl = document.createElement('div'); cardEl.className = 'pyramid-card'; cardEl.innerHTML = `<div class="card-inner"><div class="card-back"></div></div>`; rowEl.appendChild(cardEl); }); UI.pyramidContainer.appendChild(rowEl); }); }
    function renderPlayersList() { UI.playersContainer.innerHTML = ''; Object.entries(currentGame.players || {}).forEach(([id, player]) => { const playerEl = document.createElement('div'); playerEl.className = `player-item ${id === currentGame.currentTurn ? 'player-current' : ''}`; playerEl.innerHTML = `<div class="player-avatar">${player.avatar ? `<img src="${player.avatar}" alt="${player.name}">` : ''}</div><span class="player-name">${player.name}${id === playerId ?' (Vous)':''}</span><span class="sips-badge">${player.sipsToDrink||0} gorgées</span>`; UI.playersContainer.appendChild(playerEl); }); }
    function updateGameInfo() { UI.gameIdDisplay.textContent = currentGame.gameCode || '...'; UI.currentTurnDisplay.textContent = currentGame.players?.[currentGame.currentTurn]?.name || '...'; }
    function showPredictionOptions() { const revealedCount = currentGame.players[playerId].cards.filter(c => c.revealed).length; const step = revealedCount + 1; const titles = { 1: "Rouge ou Noir ?", 2: "Plus ou Moins ?", 3: "Intérieur ou Extérieur ?", 4: "Quelle famille ?" }; UI.actionTitle.textContent = titles[step] || "Faites votre choix"; const buttons = { 1: `<button style="background-color:#e74c3c;color:white;" onclick="handlePrediction('red')">Rouge</button><button style="background-color:#34495e;color:white;" onclick="handlePrediction('black')">Noir</button>`, 2: `<button style="background-color:#27ae60;" onclick="handlePrediction('higher')">Plus</button><button style="background-color:#c0392b;" onclick="handlePrediction('lower')">Moins</button>`, 3: `<button style="background-color:#2980b9;" onclick="handlePrediction('inside')">Intérieur</button><button style="background-color:#f39c12;" onclick="handlePrediction('outside')">Extérieur</button>`, 4: `<button style="color:red;" onclick="handlePrediction('hearts')">♥</button><button style="color:red;" onclick="handlePrediction('diamonds')">♦</button><button style="color:black;" onclick="handlePrediction('clubs')">♣</button><button style="color:black;" onclick="handlePrediction('spades')">♠</button>` }; UI.dynamicButtons.innerHTML = buttons[step] || ''; UI.contextualActions.classList.add('visible'); }
    function checkPrediction(choice, card, step, allCards) { const cardValue = getCardNumericValue(card.value); switch(step) { case 1: const isRed = ['hearts', 'diamonds'].includes(card.suit); return (choice === 'red' && isRed) || (choice === 'black' && !isRed); case 2: const firstCardValue = getCardNumericValue(allCards[0].value); return (choice === 'higher' && cardValue > firstCardValue) || (choice === 'lower' && cardValue < firstCardValue); case 3: const card1=getCardNumericValue(allCards[0].value); const card2=getCardNumericValue(allCards[1].value); const min=Math.min(card1, card2); const max=Math.max(card1, card2); return (choice === 'inside' && cardValue > min && cardValue < max) || (choice === 'outside' && (cardValue < min || cardValue > max)); case 4: return choice === card.suit; default: return false; } }
    function getCardNumericValue(value) { return {'J':11, 'Q':12, 'K':13, 'A':14}[value] || parseInt(value); }
    function getSuitSymbol(suit) { return { 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' }[suit] || ''; }
    function showToast(message, type) { UI.toastContent.textContent = message; UI.toast.className = `toast ${type} show`; setTimeout(() => UI.toast.classList.remove('show'), 3000); }
    function sendChatMessage() { const message = UI.chatInput.value.trim(); if(message){db.ref(`games/${gameId}/chat`).push({playerId, playerName:currentGame.players[playerId]?.name, avatar:currentGame.players[playerId]?.avatar, message, timestamp:Date.now()}); UI.chatInput.value='';}}
    function renderChatMessage(snapshot) { const msg = snapshot.val(); const messagesContainer = document.getElementById('chat-messages'); const msgEl = document.createElement('div'); msgEl.innerHTML = `<div><strong>${msg.playerName}:</strong> ${msg.message}</div>`; messagesContainer.appendChild(msgEl); messagesContainer.scrollTop = messagesContainer.scrollHeight; }
    async function handleLeaveGame() { await db.ref(`games/${gameId}/players/${playerId}`).remove(); window.location.href = 'index.html'; }

    window.handlePrediction = handlePrediction;
    window.assignSips = assignSips;
});