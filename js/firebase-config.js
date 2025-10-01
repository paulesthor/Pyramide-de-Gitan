if (!firebase.apps.length) {
    firebase.initializeApp({
        apiKey: "AIzaSyAXDC7ptVfUKte5piWzBZse8HI0Htl_uHA",
        authDomain: "site-pyramide.firebaseapp.com",
        databaseURL: "https://site-pyramide-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "site-pyramide",
        storageBucket: "site-pyramide.appspot.com",
        messagingSenderId: "426258577571",
        appId: "1:426258577571:web:b56f204f17bf0d2fec2716"
    });
}

const db = firebase.database();
window.db = db; // Rend accessible globalement

// Fallback pour navigation privée
if (typeof localStorage === 'undefined' || localStorage === null) {
    window.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    };
}