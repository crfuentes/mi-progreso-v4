import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBMKjzxFePim3ja3QuFjznLaE7l3Nc2dBY",
  authDomain: "nutrifit-2-34ead.firebaseapp.com",
  projectId: "nutrifit-2-34ead",
  storageBucket: "nutrifit-2-34ead.firebasestorage.app",
  messagingSenderId: "362172527200",
  appId: "1:362172527200:web:8b7735490d542b47734905"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
