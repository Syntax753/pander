// Multi-peer WebRTC mesh for small rooms (≤ 5 participants).
// Audio-only for now; video can be added later by passing { video: true } to ensureLocalStream.
//
// Architecture:
// - Each remote peer is a separate RTCPeerConnection in `_peers`.
// - The peer with the lexicographically smaller playerId initiates the offer
//   for any new pairing — this avoids glare without server coordination.
// - Local media is acquired lazily via ensureLocalStream(); calling it after
//   peers exist will add tracks to each connection (no renegotiation yet).

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type MeshCallbacks = {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerDisconnected: (peerId: string) => void;
  onSignal: (targetId: string, type: 'SDP_OFFER' | 'SDP_ANSWER' | 'ICE_CANDIDATE', payload: any) => void;
};

let _localStream: MediaStream | null = null;
let _localId: string = '';
let _callbacks: MeshCallbacks | null = null;
const _peers = new Map<string, RTCPeerConnection>();
const _pendingIce = new Map<string, RTCIceCandidateInit[]>();

export function initMesh(localPlayerId: string, callbacks: MeshCallbacks): void {
  _localId = localPlayerId;
  _callbacks = callbacks;
}

export async function ensureLocalStream(): Promise<MediaStream | null> {
  if (_localStream) return _localStream;
  try {
    _localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    // Add tracks to any peers that already exist
    for (const pc of _peers.values()) {
      for (const track of _localStream.getTracks()) {
        try { pc.addTrack(track, _localStream); } catch { /* already added */ }
      }
    }
  } catch (e) {
    console.warn('Could not get local audio:', e);
    return null;
  }
  return _localStream;
}

export function hasLocalStream(): boolean {
  return _localStream !== null;
}

function _createPeerConnection(peerId: string): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = (event) => {
    if (event.candidate && _callbacks) {
      _callbacks.onSignal(peerId, 'ICE_CANDIDATE', event.candidate.toJSON());
    }
  };

  pc.ontrack = (event) => {
    if (event.streams[0] && _callbacks) {
      _callbacks.onRemoteStream(peerId, event.streams[0]);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      _callbacks?.onPeerDisconnected(peerId);
    }
  };

  if (_localStream) {
    for (const track of _localStream.getTracks()) {
      try { pc.addTrack(track, _localStream); } catch { /* ignore */ }
    }
  }

  _peers.set(peerId, pc);
  return pc;
}

/** Add a peer; if `isInitiator` is true, create and send the offer. */
export async function addPeer(peerId: string): Promise<void> {
  if (_peers.has(peerId) || peerId === _localId) return;
  const pc = _createPeerConnection(peerId);

  // Deterministic initiator: the peer with the smaller id creates the offer.
  const isInitiator = _localId < peerId;
  if (isInitiator) {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      _callbacks?.onSignal(peerId, 'SDP_OFFER', offer);
    } catch (e) {
      console.error('createOffer failed for', peerId, e);
    }
  }
}

export async function handleSignal(
  fromId: string,
  type: 'SDP_OFFER' | 'SDP_ANSWER' | 'ICE_CANDIDATE',
  payload: any,
): Promise<void> {
  let pc = _peers.get(fromId);
  if (!pc) {
    // Unsolicited signal — create the peer connection lazily (we are the answerer).
    pc = _createPeerConnection(fromId);
  }
  try {
    if (type === 'SDP_OFFER') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      // Drain queued ICE candidates
      const queued = _pendingIce.get(fromId) || [];
      for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
      _pendingIce.delete(fromId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      _callbacks?.onSignal(fromId, 'SDP_ANSWER', answer);
    } else if (type === 'SDP_ANSWER') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const queued = _pendingIce.get(fromId) || [];
      for (const c of queued) await pc.addIceCandidate(new RTCIceCandidate(c));
      _pendingIce.delete(fromId);
    } else if (type === 'ICE_CANDIDATE') {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(payload));
      } else {
        // Buffer until remote description is set
        const arr = _pendingIce.get(fromId) || [];
        arr.push(payload);
        _pendingIce.set(fromId, arr);
      }
    }
  } catch (e) {
    console.error('handleSignal failed', type, fromId, e);
  }
}

export function removePeer(peerId: string): void {
  const pc = _peers.get(peerId);
  if (pc) {
    pc.close();
    _peers.delete(peerId);
  }
  _pendingIce.delete(peerId);
}

export function closeMesh(): void {
  for (const pc of _peers.values()) pc.close();
  _peers.clear();
  _pendingIce.clear();
  if (_localStream) {
    _localStream.getTracks().forEach(t => t.stop());
    _localStream = null;
  }
  _callbacks = null;
}

export function getPeerIds(): string[] {
  return Array.from(_peers.keys());
}
