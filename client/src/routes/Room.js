import React, { useRef, useEffect, useState, useReducer } from "react";
import io from "socket.io-client";
import {
    Container, 
    Messages, 
    MessageBox, 
    Button, 
    MyRow, 
    MyMessage, 
    PartnerRow, 
    PartnerMessage
} from './styles'

const Room = (props) => {
    const peerRef = useRef();
    const sendChannel = useRef();
    const [text, setText] = useState("");
    const [messages, setMessages] = useState([]);

    const [{socket,otherUser }, setState] = useReducer(
        (state, action) => ({ ...state, ...action }), 
    {
        socket: null,
        otherUser: null,
    })

    useEffect(() => {
        setState({socket: io.connect("http://localhost:8000")});
    }, []);

    useEffect(() => {
        if (socket) {
            socket.emit("join room", props.match.params.roomID);

            socket.on('other user', userID => {
                callUser(userID);
                setState({otherUser: userID});
            });

            socket.on("user joined", userID => {
                setState({otherUser: userID});
            });

            socket.on("offer", handleOffer);

            socket.on("answer", handleAnswer);

            socket.on("ice-candidate", handleNewICECandidateMsg);
        }
    }, [socket]);


    function callUser(userID) {
        peerRef.current = createPeer(userID);
        sendChannel.current = peerRef.current.createDataChannel("sendChannel")
        sendChannel.current.onmessage = handleReceiveMessage
    }

    function handleReceiveMessage(e) {
        setMessages(messages=> [...messages, {yours: false, value: e.data}])
    }

    function createPeer(userID) {
        const peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.stunprotocol.org"
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com'
                },
            ]
        });

        peer.onicecandidate = handleICECandidateEvent;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

        return peer;
    }

    function handleNegotiationNeededEvent(userID) {
        peerRef.current.createOffer().then(offer => {
            return peerRef.current.setLocalDescription(offer);
        }).then(() => {
            const payload = {
                target: userID,
                caller: socket.id,
                sdp: peerRef.current.localDescription
            };
            socket.emit("offer", payload);
        }).catch(e => console.log(e));
    }

    function handleOffer(incoming) {
        peerRef.current = createPeer();
        peerRef.current.ondatachannel = (event)=> {
            console.log('event.channel', event.channel)
            sendChannel.current = event.channel;
            sendChannel.current.onmessage = handleReceiveMessage
        }
        const desc = new RTCSessionDescription(incoming.sdp);
        peerRef.current.setRemoteDescription(desc).then(() => {
        }).then(() => {
            return peerRef.current.createAnswer();
        }).then(answer => {
            return peerRef.current.setLocalDescription(answer);
        }).then(() => {
            const payload = {
                target: incoming.caller,
                caller: socket.id,
                sdp: peerRef.current.localDescription
            }
            socket.emit("answer", payload);
        })
    }

    function handleAnswer(message) {
        const desc = new RTCSessionDescription(message.sdp);
        peerRef.current.setRemoteDescription(desc).catch(e => console.log(e));
    }

    function handleICECandidateEvent(e) {
        if (e.candidate) {
            const payload = {
                target: otherUser,
                candidate: e.candidate,
            }
            socket.emit("ice-candidate", payload);
        }
    }

    function handleNewICECandidateMsg(incoming) {
        const candidate = new RTCIceCandidate(incoming);

        peerRef.current.addIceCandidate(candidate)
            .catch(e => console.log(e));
    }

    function handleChange(e) {
        setText(e.target.value);
    }

    function sendMessage() {
        sendChannel.current.send(text);
        setMessages(messages=> [...messages, {yours: true, value: text}])
        setText("")
    }

    function renderMessage(message, index) {
        if (message.yours) {
            return (
                <MyRow key={index}>
                    <MyMessage>
                        {message.value}
                    </MyMessage>
                </MyRow>
            )
        }

        return (
            <PartnerRow key={index}>
                <PartnerMessage>
                    {message.value}
                </PartnerMessage>
            </PartnerRow>
        )
    }

    return (
        <Container>
            <Messages>
                {messages.map(renderMessage)}
            </Messages>
            <MessageBox value={text} onChange={handleChange} placeholder="Say something....." />
            <Button onClick={sendMessage}>Send..</Button>
        </Container>
    );
};

export default Room;