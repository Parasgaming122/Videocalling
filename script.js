// Generate random room name if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);
  
// TODO: Replace with your own channel ID
const drone = new ScaleDrone('y0N6q0oVsjY9fEiu');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pc;
let localStream = null;
let screenStream = null;
let isScreenSharing = false;
  
  
function onSuccess() {};
function onError(error) {
  console.error(error);
};
  
drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('MEMBERS', members);
    // If we are the second user to connect to the room we will be creating the offer
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});
  
// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}
  
function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);
  
  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }
  };
  
  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }
  
  // When a remote stream arrives display it in the #remoteVideo element
  pc.onaddstream = event => {
    remoteVideo.srcObject = event.stream;
  };
  
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    pc.addStream(stream);
    setupControls();
  }, onError);
  
  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }
  
    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}
  
function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
    onError
  );
}
  
function setupControls() {
  const toggleVideo = document.getElementById('toggleVideo');
  const toggleAudio = document.getElementById('toggleAudio');
  const toggleScreen = document.getElementById('toggleScreen');
  const endCall = document.getElementById('endCall');

  toggleVideo.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      toggleVideo.classList.toggle('active');
    }
  });

  toggleAudio.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      toggleAudio.classList.toggle('active');
    }
  });

  toggleScreen.addEventListener('click', async () => {
    if (!isScreenSharing) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const videoTrack = screenStream.getVideoTracks()[0];
        
        const sender = pc.getSenders().find(s => s.track.kind === 'video');
        await sender.replaceTrack(videoTrack);
        
        localVideo.srcObject = screenStream;
        toggleScreen.classList.add('active');
        isScreenSharing = true;

        videoTrack.onended = () => {
          stopScreenSharing();
        };
      } catch (e) {
        console.error(e);
      }
    } else {
      stopScreenSharing();
    }
  });

  endCall.addEventListener('click', () => {
    window.location.href = window.location.pathname;
  });

  setupFullscreenButtons();
}

async function stopScreenSharing() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = pc.getSenders().find(s => s.track.kind === 'video');
    await sender.replaceTrack(videoTrack);
    localVideo.srcObject = localStream;
  }

  toggleScreen.classList.remove('active');
  isScreenSharing = false;
}

function setupFullscreenButtons() {
  const fullscreenButtons = document.querySelectorAll('.fullscreen-btn');
  
  fullscreenButtons.forEach(button => {
    button.addEventListener('click', () => {
      const videoId = button.dataset.video;
      const video = document.getElementById(videoId);
      
      if (!document.fullscreenElement) {
        if (video.requestFullscreen) {
          video.requestFullscreen();
        } else if (video.webkitRequestFullscreen) { /* Safari */
          video.webkitRequestFullscreen();
        } else if (video.msRequestFullscreen) { /* IE11 */
          video.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
          document.msExitFullscreen();
        }
      }
    });
  });

  // Update fullscreen button icon when fullscreen changes
  document.addEventListener('fullscreenchange', updateFullscreenButtons);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);
  document.addEventListener('mozfullscreenchange', updateFullscreenButtons);
  document.addEventListener('MSFullscreenChange', updateFullscreenButtons);
}

function updateFullscreenButtons() {
  const fullscreenButtons = document.querySelectorAll('.fullscreen-btn svg');
  if (document.fullscreenElement) {
    fullscreenButtons.forEach(svg => {
      svg.innerHTML = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';
    });
  } else {
    fullscreenButtons.forEach(svg => {
      svg.innerHTML = '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
    });
  }
}

// Call this function after your video elements are set up
setupFullscreenButtons();