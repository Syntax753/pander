import BattleMessage from "./types/BattleMessage";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

type PeerCallbacks = {
  onRemoteStream: (stream: MediaStream) => void;
  onDataMessage: (message: BattleMessage) => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
};

let _peerConnection: RTCPeerConnection | null = null;
let _dataChannel: RTCDataChannel | null = null;
let _localStream: MediaStream | null = null;
let _callbacks: PeerCallbacks | null = null;

function _setupDataChannel(channel: RTCDataChannel) {
  _dataChannel = channel;
  channel.onmessage = (event) => {
    const message: BattleMessage = JSON.parse(event.data);
    _callbacks?.onDataMessage(message);
  };
}

export async function initPeerConnection(callbacks: PeerCallbacks): Promise<void> {
  _callbacks = callbacks;

  _peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  _peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      callbacks.onIceCandidate(event.candidate);
    }
  };

  _peerConnection.onconnectionstatechange = () => {
    if (_peerConnection) {
      callbacks.onConnectionStateChange(_peerConnection.connectionState);
    }
  };

  _peerConnection.ontrack = (event) => {
    if (event.streams[0]) {
      callbacks.onRemoteStream(event.streams[0]);
    }
  };

  // Get local audio (video deferred — audio-only for now)
  try {
    _localStream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: false,
    });
    for (const track of _localStream.getTracks()) {
      _peerConnection.addTrack(track, _localStream);
    }
  } catch (e) {
    console.warn('Could not get local audio — continuing without mic:', e);
  }
}

export async function createOffer(): Promise<RTCSessionDescriptionInit> {
  if (!_peerConnection) throw Error('Peer connection not initialized');

  // Challenger creates the data channel
  const channel = _peerConnection.createDataChannel('battle', {
    ordered: true,
  });
  _setupDataChannel(channel);

  const offer = await _peerConnection.createOffer();
  await _peerConnection.setLocalDescription(offer);
  return offer;
}

export async function handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
  if (!_peerConnection) throw Error('Peer connection not initialized');

  // Defender receives the data channel
  _peerConnection.ondatachannel = (event) => {
    _setupDataChannel(event.channel);
  };

  await _peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await _peerConnection.createAnswer();
  await _peerConnection.setLocalDescription(answer);
  return answer;
}

export async function handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
  if (!_peerConnection) throw Error('Peer connection not initialized');
  await _peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

export async function addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
  if (!_peerConnection) throw Error('Peer connection not initialized');
  await _peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

export function sendBattleMessage(message: BattleMessage): void {
  if (!_dataChannel || _dataChannel.readyState !== 'open') {
    console.warn('Data channel not ready, dropping message:', message.type);
    return;
  }
  _dataChannel.send(JSON.stringify(message));
}

export function getLocalStream(): MediaStream | null {
  return _localStream;
}

export function getConnectionState(): RTCPeerConnectionState | null {
  return _peerConnection?.connectionState ?? null;
}

export function closePeerConnection(): void {
  if (_dataChannel) {
    _dataChannel.close();
    _dataChannel = null;
  }
  if (_localStream) {
    _localStream.getTracks().forEach(track => track.stop());
    _localStream = null;
  }
  if (_peerConnection) {
    _peerConnection.close();
    _peerConnection = null;
  }
  _callbacks = null;
}
