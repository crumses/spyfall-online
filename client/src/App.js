import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io(window.location.origin);

function App() {
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinedRoom, setJoinedRoom] = useState(null);
  const [locations, setLocations] = useState(["", "", "", "", ""]);
  const [rolesMatrix, setRolesMatrix] = useState(
    Array(5).fill(null).map(() => Array(5).fill(""))
  );

  const [players, setPlayers] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [assignedLocation, setAssignedLocation] = useState("");
  const [assignedRole, setAssignedRole] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [vote, setVote] = useState("");
  const [votes, setVotes] = useState({});
  const [targetPlayer, setTargetPlayer] = useState("");
  const [questionTurn, setQuestionTurn] = useState(false);
  const [answerTurn, setAnswerTurn] = useState(false);
  const [turnTimer, setTurnTimer] = useState(30);
  const [globalTimer, setGlobalTimer] = useState(500);
  const [showResults, setShowResults] = useState(false);
  const [spyId, setSpyId] = useState("");
  const [myId, setMyId] = useState(null);
  const [currentAsker, setCurrentAsker] = useState("");
  const [currentAnswerer, setCurrentAnswerer] = useState("");

  useEffect(() => {
    socket.on("connect", () => setMyId(socket.id));

    socket.on("update-room", (room) => setPlayers(room.players));

    socket.on("game-started", (data) => {
      const me = data.players.find(p => p.id === socket.id);
      if (me) {
        setAssignedLocation(me.assignedLocation);
        setAssignedRole(me.assignedRole);
      }
      setSpyId(data.spyId);
      setPlayers(data.players);
      setGameStarted(true);
    });

    socket.on("new-message", (msg) => {
      setChat(prev => [...prev, msg]);
    });

    socket.on("question-turn", ({ asker, answerer }) => {
      setQuestionTurn(asker === socket.id);
      setAnswerTurn(answerer === socket.id);
      setTargetPlayer("");
      setTurnTimer(30);

      const askerName = players.find(p => p.id === asker)?.username || "";
      const answererName = players.find(p => p.id === answerer)?.username || "";
      setCurrentAsker(askerName);
      setCurrentAnswerer(answererName);
    });

    socket.on("votes-update", (voteData) => {
      setVotes(voteData);
    });

    socket.on("game-ended", ({ spyId, votes, players }) => {
      setSpyId(spyId);
      setVotes(votes);
      setPlayers(players);
      setShowResults(true);
    });

    return () => {
      socket.off("connect");
      socket.off("update-room");
      socket.off("game-started");
      socket.off("new-message");
      socket.off("question-turn");
      socket.off("votes-update");
      socket.off("game-ended");
    };
  }, [players]);

  useEffect(() => {
    if (gameStarted) {
      const interval = setInterval(() => {
        setGlobalTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setShowResults(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameStarted]);

  useEffect(() => {
    let interval;
    if (questionTurn || answerTurn) {
      interval = setInterval(() => {
        setTurnTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setQuestionTurn(false);
            setAnswerTurn(false);
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [questionTurn, answerTurn]);

  const createRoom = () => {
    socket.emit("create-room", { username }, (code) => {
      setRoomCode(code);
      setJoinedRoom(code);
    });
  };

  const joinRoom = () => {
    socket.emit("join-room", { roomCode, username }, (err) => {
      if (err) alert(err);
      else setJoinedRoom(roomCode);
    });
  };

  const submitLocationsAndRoles = () => {
    const flattenedRoles = rolesMatrix.flat();
    const allFilled = locations.every(loc => loc.trim()) && flattenedRoles.every(role => role.trim());
    if (!allFilled) {
      alert("Tüm yer ve roller doldurulmalı!");
      return;
    }

    socket.emit("submit-locations-roles", {
      roomCode,
      locations,
      roles: flattenedRoles,
    });
  };

  const startGame = () => {
    socket.emit("start-game", { roomCode });
  };

  const sendMessage = () => {
    if (message.trim()) {
      socket.emit("send-message", { roomCode, username, message });
      setMessage("");
    }
  };

  const votePlayer = (id) => {
    setVote(id);
    socket.emit("vote", { roomCode, votedId: id });
  };

  const beginQuestion = (id) => {
    setTargetPlayer(id);
    setQuestionTurn(false);
    socket.emit("ask-question", { roomCode, toId: id });
  };

  const endTurn = () => {
    if (answerTurn) {
      setAnswerTurn(false);
      socket.emit("end-answer", { roomCode });
    }
  };

  if (!joinedRoom) {
    return (
      <div className="container">
        <h1>Spyfall</h1>
        <input placeholder="Kullanıcı Adı" onChange={(e) => setUsername(e.target.value)} />
        <button onClick={createRoom}>Yeni Oda Oluştur</button>
        <input placeholder="Oda Kodu" onChange={(e) => setRoomCode(e.target.value)} />
        <button onClick={joinRoom}>Odaya Katıl</button>
      </div>
    );
  }

  if (showResults) {
    const votedSpy = Object.values(votes).filter(id => id === spyId).length;
    return (
      <div className="container">
        <h2>Oyun Bitti</h2>
        <p>Spy: {players.find(p => p.id === spyId)?.username || "?"}</p>
        <p>Doğru Tahmin Sayısı: {votedSpy} / {players.length}</p>
      </div>
    );
  }

  if (gameStarted) {
    return (
      <div className="container">
        <h2>Oyun Süresi: {globalTimer}s</h2>
        <p><strong>Yer:</strong> {assignedLocation}</p>
        <p><strong>Rol:</strong> {assignedRole}</p>
        <p><strong>Tur Süresi:</strong> {turnTimer}s</p>

        {currentAsker && currentAnswerer && (
          <div className="question-info">
            <p><strong>{currentAsker}</strong>, <strong>{currentAnswerer}</strong>'a soru soruyor.</p>
          </div>
        )}

        <div className="chat">
          <h3>Sohbet</h3>
          <div className="chat-box">
            {chat.map((c, i) => (
              <div key={i}><b>{c.username}:</b> {c.message}</div>
            ))}
          </div>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <button onClick={sendMessage}>Gönder</button>
        </div>

        <h3>Oyuncular</h3>
        <ul>
          {players.map(p => (
            <li key={p.id}>
              {p.username}
              {questionTurn && p.id !== socket.id && (
                <button onClick={() => beginQuestion(p.id)}>Soru Sor</button>
              )}
              <button onClick={() => votePlayer(p.id)}>Oy Ver</button>

            </li>
          ))}
        </ul>
<h3>Oylama Tablosu</h3>
<table className="vote-table">
  <thead>
    <tr>
      <th>Oy Kullanan</th>
      <th>Oy Verilen</th>
    </tr>
  </thead>
  <tbody>
    {Object.entries(votes).map(([voterId, votedId]) => {
      const voter = players.find(p => p.id === voterId);
      const voted = players.find(p => p.id === votedId);
      return (
        <tr key={voterId}>
          <td>{voter?.username || "?"}</td>
          <td>{voted?.username || "?"}</td>
        </tr>
      );
    })}
  </tbody>
</table>


        {answerTurn && <button onClick={endTurn}>Cevabı Bitir</button>}
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Oda: {joinedRoom}</h2>
      <h3>Oyuncular:</h3>
      <ul>{players.map(p => <li key={p.id}>{p.username}</li>)}</ul>

      <h3>Yerler ve Roller</h3>
      {locations.map((loc, i) => (
        <div key={i}>
          <input
            placeholder={`Yer ${i + 1}`}
            value={loc}
            onChange={(e) => {
              const newLocs = [...locations];
              newLocs[i] = e.target.value;
              setLocations(newLocs);
            }}
          />
          <div className="role-group">
            {rolesMatrix[i].map((role, j) => (
              <input
                key={j}
                placeholder={`Rol ${j + 1}`}
                value={role}
                onChange={(e) => {
                  const newMatrix = [...rolesMatrix];
                  newMatrix[i][j] = e.target.value;
                  setRolesMatrix(newMatrix);
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <button onClick={submitLocationsAndRoles}>Gönder</button>
      {players[0]?.id === myId && <button onClick={startGame}>Oyunu Başlat</button>}

      <h3>Girilmiş Veriler</h3>
      <table>
        <thead><tr><th>Oyuncu</th><th>Yerler</th><th>Roller</th></tr></thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id}>
              <td>{p.username}</td>
              <td>{p.locations.join(", ")}</td>
              <td>{p.roles.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
