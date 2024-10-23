import axios from 'axios';
import React, { useRef, useState, useEffect } from 'react';

const WebCamCapture = () => {
    const webcamRef = useRef(null);
    const [image, setImage] = useState(null);
    const [videoURL, setVideoURL] = useState(null);
    const [hasError, setHasError] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recordedChunks, setRecordedChunks] = useState([]);
    const mediaRecorderRef = useRef(null);
    const [tagValue, setTagValue] = useState('');
    const [tagDisabled, setTagDisabled] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const tagChange = (event) => {
        setTagValue(event.target.value); // Update the state with the input's value
    };

    const sendErrorToUser = (message) => {
        setErrorMessage(message);  // Set the error message in state
    };

    const uploadVideo = async () => {
        setTagDisabled(false);

        const videoBlob = new Blob(recordedChunks, { type: 'video/webm' });

        const formData = new FormData();
        formData.append('video', videoBlob, 'recorded-video.webm');
        formData.append('tagValue', tagValue);
        try {
            const response = await axios.post('/api/v2/train', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
        } catch (error) {
        }

        setRecordedChunks([]);
    }
    