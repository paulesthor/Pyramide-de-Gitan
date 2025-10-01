// game2-liar.js - Gestion des accusations de mensonge (version corrigée)
document.addEventListener('DOMContentLoaded', () => {
    console.log('[DEBUG] Liar handler initialized');
    
    // Get game parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const playerId = urlParams.get('playerId');
    
    if (!gameId || !playerId) {
        console.error('[ERROR] Missing gameId or playerId in liar handler');
        return;
    }
    
    const db = window.db;
    const gameRef = db.ref(`games/${gameId}`);
    
    let currentGame = {};
    let isProcessing = false;
    
    // Écouter les changements du jeu
    gameRef.on('value', (snapshot) => {
        currentGame = snapshot.val() || {};
        
        // NOUVELLE LOGIQUE POUR LIRE LA FILE D'ATTENTE (sipsQueue)
        const sipsQueue = currentGame.players[playerId]?.sipsQueue;

        if (sipsQueue) {
            // Trouver l'événement le plus ancien dans la file d'attente en triant par timestamp
            const eventKeys = Object.keys(sipsQueue).sort((a, b) => 
                sipsQueue[a].timestamp - sipsQueue[b].timestamp
            );
            const oldestEventKey = eventKeys[0];
            
            if (oldestEventKey) {
                const oldestEvent = sipsQueue[oldestEventKey];
                // On affiche les boutons pour l'événement le plus ancien
                showLiarButtons(oldestEvent.amount, oldestEvent.fromId, oldestEventKey);
            } else {
                // S'il n'y a plus d'événement dans la file, on cache les boutons
                hideLiarButtons();
            }
        } else {
            // Si la file n'existe pas, on cache les boutons
            hideLiarButtons();
        }
        
        // La logique pour le joueur ACCUSÉ ne change pas
        const isAccused = currentGame.players[playerId]?.isAccused;
        const accusedOfCard = currentGame.players[playerId]?.accusedOfCard;
        const accusedSips = currentGame.players[playerId]?.accusedSips;
        const accusedBy = currentGame.players[playerId]?.accusedBy;
        
        if (isAccused && accusedOfCard && accusedSips && accusedBy) {
            showProofCardsForAccused();
        }
    });
    
    // Fonction pour afficher les boutons "Menteur" ou "Boire"
    function showLiarButtons(sips, fromPlayerId, sipEventKey) {
        console.log(`[DEBUG] Showing liar buttons for ${sips} sips from ${fromPlayerId}`);
        
        const actionsContainer = document.getElementById('dynamic-actions-container');
        if (!actionsContainer) {
            console.error('[ERROR] Actions container not found!');
            return;
        }
        
        if (playerId === fromPlayerId) {
            hideLiarButtons();
            return;
        }
        
        const fromPlayerName = currentGame.players[fromPlayerId]?.name || "Un joueur";
        
        actionsContainer.classList.remove('hidden');
        actionsContainer.innerHTML = `
            <div class="action-prompt">
                <p>${fromPlayerName} vous a donné ${sips} gorgée${sips > 1 ? 's' : ''}</p>
            </div>
            <div class="action-buttons">
                <button class="action-button liar-button" onclick="handleLiarAccusation(${sips}, '${fromPlayerId}', '${sipEventKey}')">
                    Menteur!
                </button>
                <button class="action-button drink-button" onclick="handleDrinkSips(${sips}, '${fromPlayerId}', '${sipEventKey}')">
                    Boire
                </button>
            </div>
        `;
    }
    
    // Cacher les boutons "Menteur/Boire"
    function hideLiarButtons() {
        const actionsContainer = document.getElementById('dynamic-actions-container');
        if (actionsContainer) {
            // Ne cacher que si ce sont les boutons "Menteur/Boire" ou "Avouer"
            if (actionsContainer.innerHTML.includes('Menteur!') || 
                actionsContainer.innerHTML.includes('Boire') ||
                actionsContainer.innerHTML.includes('Avouer')) {
                actionsContainer.classList.add('hidden');
                actionsContainer.innerHTML = '';
            }
        }
    }
    
    // Gérer l'accusation de mensonge
    async function handleLiarAccusation(sips, fromPlayerId, sipEventKey) {
        console.log(`[DEBUG] Liar accusation for ${sips} sips from ${fromPlayerId}`);
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            const lastRevealedCard = getLastRevealedCard();
            if (!lastRevealedCard) {
                showToast("Aucune carte n'a été révélée!", 'error');
                isProcessing = false;
                return;
            }
            
            const updates = {
                [`players/${fromPlayerId}/isAccused`]: true,
                [`players/${fromPlayerId}/accusedOfCard`]: lastRevealedCard.value,
                [`players/${fromPlayerId}/accusedSips`]: sips,
                [`players/${fromPlayerId}/accusedBy`]: playerId,
                // On supprime l'événement traité de la file d'attente
                [`players/${playerId}/sipsQueue/${sipEventKey}`]: null
            };
            
            await gameRef.update(updates);
            
            const chatRef = db.ref(`games/${gameId}/chat`);
            const currentPlayerName = currentGame.players[playerId]?.name || "Un joueur";
            const fromPlayerName = currentGame.players[fromPlayerId]?.name || "un joueur";
            
            await chatRef.push({
                playerId: "system",
                playerName: "Système",
                message: `${currentPlayerName} accuse ${fromPlayerName} de mentir! ${fromPlayerName} doit prouver qu'il a la carte ${lastRevealedCard.value}.`,
                timestamp: Date.now(),
                isSystem: true
            });
            
            hideLiarButtons();
            showToast(`Accusation envoyée!`, 'success');
            
        } catch (error) {
            console.error('[ERROR] During liar accusation:', error);
            showToast("Erreur: " + error.message, 'error');
        } finally {
            isProcessing = false;
        }
    }
    
    // Gérer l'acceptation des gorgées (boire)
    async function handleDrinkSips(sips, fromPlayerId, sipEventKey) {
        console.log(`[DEBUG] Drinking ${sips} sips from ${fromPlayerId}`);
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            // On supprime l'événement traité de la file d'attente
            await gameRef.update({
                [`players/${playerId}/sipsQueue/${sipEventKey}`]: null
            });
            
            const chatRef = db.ref(`games/${gameId}/chat`);
            const currentPlayerName = currentGame.players[playerId]?.name || "Un joueur";
            
            await chatRef.push({
                playerId: "system",
                playerName: "Système",
                message: `${currentPlayerName} a bu ${sips} gorgée${sips > 1 ? 's' : ''}.`,
                timestamp: Date.now(),
                isSystem: true
            });
            
            hideLiarButtons();
            showToast(`Vous avez bu ${sips} gorgée${sips > 1 ? 's' : ''}`, 'success');
            
        } catch (error) {
            console.error('[ERROR] During drink sips:', error);
            showToast("Erreur: " + error.message, 'error');
        } finally {
            isProcessing = false;
        }
    }

    // Gérer la preuve de carte (quand un joueur accusé prouve qu'il a la carte)
// Gérer la preuve de carte (quand un joueur accusé prouve qu'il a la carte)
    async function handleShowProofCard(cardIndex, cardValue, sips, accusedBy) {
        console.log(`[DEBUG] Showing proof card ${cardIndex} with value ${cardValue}`);
        
        if (isProcessing) {
            console.log('[DEBUG] Already processing - ignoring click');
            return;
        }
        
        // VÉRIFICATIONS DE SÉCURITÉ
        if (!cardValue || !accusedBy) {
            console.error('[ERROR] Missing parameters in handleShowProofCard');
            showToast("Erreur: données manquantes", 'error');
            return;
        }
        
        isProcessing = true;
        
        try {
            const lastRevealedCard = getLastRevealedCard();
            if (!lastRevealedCard) {
                showToast("Aucune carte n'a été révélée!", 'error');
                return;
            }
            
            const accusedPlayerId = playerId; // Le joueur qui clique (accusé)
            const accusedPlayerName = currentGame.players[accusedPlayerId]?.name || "Un joueur";
            const accuserPlayerName = currentGame.players[accusedBy]?.name || "Un joueur";
            
            console.log(`[DEBUG] Accused: ${accusedPlayerName}, Accuser: ${accuserPlayerName}`);
            console.log(`[DEBUG] Required card: ${lastRevealedCard.value}, Shown card: ${cardValue}`);
            
            if (cardValue === lastRevealedCard.value) {
                // Le joueur a prouvé qu'il disait vrai - l'accusateur boit le double
                const accuserCurrentSips = currentGame.players[accusedBy]?.sipsToDrink || 0;
                
                await gameRef.update({
                    [`players/${accusedPlayerId}/isAccused`]: false,
                    [`players/${accusedPlayerId}/accusedOfCard`]: null,
                    [`players/${accusedPlayerId}/accusedSips`]: null,
                    [`players/${accusedPlayerId}/accusedBy`]: null,
                    [`players/${accusedPlayerId}/hasRespondedToSips`]: true,
                    // L'accusateur doit boire le double
                    [`players/${accusedBy}/sipsToDrink`]: accuserCurrentSips + (sips * 2)
                });
                
                // Ajouter un message dans le chat
                const chatRef = db.ref(`games/${gameId}/chat`);
                await chatRef.push({
                    playerId: "system",
                    playerName: "Système",
                    avatar: "",
                    message: `${accusedPlayerName} a prouvé qu'il disait vrai! ${accuserPlayerName} doit boire ${sips * 2} gorgées`,
                    timestamp: Date.now(),
                    isSystem: true
                });
                
                showToast(`Vous avez prouvé que vous disiez vrai! ${accuserPlayerName} boit ${sips * 2} gorgées`, 'success');
                
            } else {
                // Le joueur n'a pas la bonne carte, il doit boire le double
                const currentSips = currentGame.players[accusedPlayerId]?.sipsToDrink || 0;
                
                await gameRef.update({
                    [`players/${accusedPlayerId}/isAccused`]: false,
                    [`players/${accusedPlayerId}/accusedOfCard`]: null,
                    [`players/${accusedPlayerId}/accusedSips`]: null,
                    [`players/${accusedPlayerId}/accusedBy`]: null,
                    [`players/${accusedPlayerId}/hasRespondedToSips`]: true,
                    [`players/${accusedPlayerId}/sipsToDrink`]: currentSips + (sips * 2)
                });
                
                // Ajouter un message dans le chat
                const chatRef = db.ref(`games/${gameId}/chat`);
                await chatRef.push({
                    playerId: "system",
                    playerName: "Système",
                    avatar: "",
                    message: `${accusedPlayerName} n'avait pas la bonne carte! Il doit boire ${sips * 2} gorgées`,
                    timestamp: Date.now(),
                    isSystem: true
                });
                
                showToast(`Vous n'avez pas la bonne carte! Vous devez boire ${sips * 2} gorgées`, 'error');
            }
            
            // Cacher les boutons d'action
            hideLiarButtons();
            
        } catch (error) {
            console.error('[ERROR] During show proof card:', error);
            showToast("Erreur: " + error.message, 'error');
        } finally {
            isProcessing = false;
        }
    }
    // Fonction pour afficher les cartes du joueur accusé avec option de preuve
    function showProofCardsForAccused() {
        // Le joueur qui a DONNÉ les gorgées (accusé) voit ces instructions
        const accusedOfCard = currentGame.players[playerId]?.accusedOfCard;
        const accusedSips = currentGame.players[playerId]?.accusedSips;
        const accusedBy = currentGame.players[playerId]?.accusedBy;
        
        if (accusedOfCard && accusedSips && accusedBy) {
            console.log('[DEBUG] Player gave sips and is accused - showing proof instructions');
            
            const actionsContainer = document.getElementById('dynamic-actions-container');
            if (!actionsContainer) return;
            
            const accuserName = currentGame.players[accusedBy]?.name || "un joueur";
            
            actionsContainer.classList.remove('hidden');
            actionsContainer.innerHTML = `
                <div class="action-prompt">
                    <p>${accuserName} vous accuse de mentir sur la carte ${accusedOfCard}!</p>
                    <p><strong>Cliquez sur votre carte ${accusedOfCard} pour prouver que vous disiez vrai</strong></p>
                    <p><small>Si vous avez la carte : ${accuserName} boit ${accusedSips * 2} gorgées</small></p>
                    <p><small>Si vous n'avez pas la carte : vous buvez ${accusedSips * 2} gorgées</small></p>
                </div>
            `;
        }
    }
    
    // Helper: Obtenir la dernière carte révélée dans la pyramide
    function getLastRevealedCard() {
        const pyramid = currentGame.pyramid || [];
        
        // Parcourir la pyramide de bas en haut pour trouver la dernière carte révélée
        for (let i = pyramid.length - 1; i >= 0; i--) {
            for (let j = pyramid[i].length - 1; j >= 0; j--) {
                if (pyramid[i][j] && pyramid[i][j].revealed) {
                    return pyramid[i][j];
                }
            }
        }
        
        return null;
    }
    
    // Fonction pour afficher les options pour le joueur accusé de mentir
    function showAccusedOptions(cardValue, sips, accuserId) {
        console.log(`[DEBUG] Showing options for accused player ${playerId}`);
        
        const actionsContainer = document.getElementById('dynamic-actions-container');
        if (!actionsContainer) {
            console.error('[ERROR] Actions container not found!');
            return;
        }
        
        const accuserName = currentGame.players[accuserId]?.name || "Un joueur";
        
        actionsContainer.classList.remove('hidden');
        actionsContainer.innerHTML = `
            <div class="action-prompt">
                <p>${accuserName} vous accuse de mentir!</p>
                <p>Vous devez prouver que vous avez un ${cardValue} ou avouer.</p>
            </div>
            <div class="action-buttons">
                <button class="action-button admit-button" onclick="handleAdmitLiar(${sips}, '${accuserId}')">
                    Avouer le mensonge (boire ${sips * 2} gorgées)
                </button>
            </div>
            <p style="color: #e74c3c; margin-top: 10px; font-size: 0.9rem;">
                Cliquez sur une de vos cartes pour prouver que vous avez un ${cardValue}
            </p>
        `;
    }
    
    // Gérer l'aveu d'avoir menti
    async function handleAdmitLiar(sips, accuserId) {
        console.log(`[DEBUG] Admitting liar for ${sips} sips from ${accuserId}`);
        
        if (isProcessing) {
            console.log('[DEBUG] Already processing - ignoring click');
            return;
        }
        
        isProcessing = true;
        
        try {
            const currentSips = currentGame.players[playerId]?.sipsToDrink || 0;
            const updates = {
                [`players/${playerId}/sipsToDrink`]: currentSips + (sips * 2), // Double pénalité
                [`players/${playerId}/isAccused`]: false,
                [`players/${playerId}/accusedOfCard`]: null,
                [`players/${playerId}/accusedSips`]: null,
                [`players/${playerId}/accusedBy`]: null,
                [`players/${playerId}/hasRespondedToSips`]: true,
                [`players/${accuserId}/hasActedForCard`]: true
            };
            
            await gameRef.update(updates);
            
            // Message dans le chat
            const chatRef = db.ref(`games/${gameId}/chat`);
            const currentPlayerName = currentGame.players[playerId]?.name || "Un joueur";
            const accuserName = currentGame.players[accuserId]?.name || "Un joueur";
            
            await chatRef.push({
                playerId: "system",
                playerName: "Système",
                avatar: "",
                message: `${currentPlayerName} a avoué avoir menti! Il doit boire ${sips * 2} gorgées.`,
                timestamp: Date.now(),
                isSystem: true
            });
            
            // Cacher les boutons d'action
            hideLiarButtons();
            
            showToast(`Vous avez avoué et devez boire ${sips * 2} gorgées.`, 'error');
            
        } catch (error) {
            console.error('[ERROR] During admit liar:', error);
            showToast("Erreur: " + error.message, 'error');
        } finally {
            isProcessing = false;
        }
    }
    
    // Fonction pour afficher une notification toast
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast-notification');
        const toastContent = document.querySelector('.toast-content');
        
        if (!toast || !toastContent) {
            console.error('[ERROR] Toast elements not found!');
            return;
        }
        
        toastContent.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    // Exposer les fonctions au scope global
    window.liarHandler = {
        showLiarButtons,
        hideLiarButtons,
        handleShowProofCard,
        showAccusedOptions,
        handleAdmitLiar
    };
    
    // Exposer les fonctions pour les boutons HTML
    window.handleLiarAccusation = handleLiarAccusation;
    window.handleDrinkSips = handleDrinkSips;
    window.handleAdmitLiar = handleAdmitLiar;
});