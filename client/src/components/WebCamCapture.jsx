import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import { Container, Card, Button, Modal } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style-DONOTUSE.css";

const WebCamCapture = () => {
  const webcamRef = useRef(null);
  const [videoURL, setVideoURL] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const mediaRecorderRef = useRef(null);
  const [tagValue, setTagValue] = useState("");
  const [tagDisabled, setTagDisabled] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false); // for error modal
  const [capturedImage, setCapturedImage] = useState(null);
  const [showGetWheelID, setShowGetWheelID] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const [showGetAnotherIDButton, setShowGetAnotherIDButton] = useState(false);
  const [showTrainWheelMessage, setShowTrainWheelMessage] = useState(false);
  const [showModalWheelId, setShowModalWheelId] = useState(false);

  const tagChange = (event) => {
    setTagValue(event.target.value);
  };

  const sendErrorToUser = (message) => {
    setErrorMessage(message);
  };

  const uploadVideo = async () => {
    setTagDisabled(false);

    const videoBlob = new Blob(recordedChunks, { type: "video/webm" });
    const formData = new FormData();
    formData.append("video", videoBlob, "recorded-video.webm");
    formData.append("tagValue", tagValue);
    try {
      const response = await axios.post("/api/v2/train", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      // Assuming the backend response contains an array of results with "ALY" keys and percentages
      const results = response.data.results; // Update this if the response format differs

      if (results && results.length > 0) {
        const topResult = results[0]; // Get the top result
        const topKey = Object.keys(topResult)[0]; // e.g., 'ALY71474R'
        const topPercentage = topResult[topKey]; // e.g., 24.89%

        alert(`Top result: ${topKey} with ${topPercentage}% accuracy`);
      } else {
        alert("No results available.");
      }

      console.log(response);
      alert("Video uploaded successfully!");
      setVideoURL(null);
    } catch (error) {
      sendErrorToUser(error.response.data.message);
      console.error("Error uploading video:", error);
    }
    setRecordedChunks([]);
  };

  const capture = () => {
    const video = webcamRef.current;
    if (!video) {
      console.error("Webcam is not available.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedImageUrl = canvas.toDataURL("image/png");
    setCapturedImage(capturedImageUrl);
  };

  // Upload captured image to backend for prediction
  const handleCapture = async () => {
    if (!capturedImage) {
      console.error("No captured image to upload.");
      return;
    }

    try {
      const formData = new FormData();
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      formData.append("image", blob, "captured-image.png");

      const result = await axios.post("/api/v1/predict", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const { wheelId, probability } = result.data;

      if (probability >= 80) {
        setPredictionResult(
          `Prediction Success: ${wheelId} with ${probability}% accuracy.`
        );
        setShowGetAnotherIDButton(true);
      } else {
        setPredictionResult(
          `Low Accuracy: ${probability}%. You need to train the wheel.`
        );
        setShowTrainWheelMessage(true);
      }
    } catch (error) {
      console.error("Error predicting the image:", error);
    }
    setShowModalWheelId(true);
  };

  const startRecording = () => {
    if (
      webcamRef.current &&
      webcamRef.current.srcObject instanceof MediaStream
    ) {
      if (tagValue === "") {
        sendErrorToUser("Please input a tag for this video.");
        return;
      } else if (!tagValue.startsWith("ALY") && !tagValue.startsWith("STL")) {
        sendErrorToUser('Tag must start with "ALY" or "STL".');
        return;
      } else {
        setTagDisabled(true);
      }

      const stream = webcamRef.current.srcObject;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);

          const videoBlob = new Blob([event.data], { type: "video/webm" });
          const videoURL = URL.createObjectURL(videoBlob);
          setVideoURL(videoURL);
        }
      };

      if (isStopped) {
        setRecordedChunks([]);
      }

      mediaRecorder.start();
      setRecording(true);
      setIsStopped(false);

      setTimeout(() => {
        stopRecording();
      }, 10000); // set the limit of recording video: 10000 = 10s
    } else {
      sendErrorToUser("Webcam reference is not set or stream is invalid.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setIsStopped(true);
    }
  };

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
      }

      setPermissionGranted(true);
      setHasError(false);
    } catch (error) {
      console.error("Error accessing webcam:", error);
      sendErrorToUser(`Error accessing webcam: ${error.message}`);
      setHasError(true);
    }
  };

  const handleGetWheelID = () => {
    startWebcam();
    setShowGetWheelID(true);
  };

  const handleTrainWheel = () => {
    startWebcam();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setErrorMessage(""); // clear the error when close the modal
    setVideoURL(null);
  };

  const closeErrorModal = () => {
    // when the close error modal button is clicked
    setShowErrorModal(false);
    setErrorMessage(""); // clear the error when close the error modal
  };

  const resetModal = () => {
    setShowModalWheelId(false);
    setPredictionResult(null);
    setShowGetAnotherIDButton(false);
    setShowTrainWheelMessage(false);
  };

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "camera" })
        .then((permissionStatus) => {
          if (permissionStatus.state === "granted") {
            setPermissionGranted(true);
          } else {
            setHasError(true);
          }
        })
        .catch((error) => {
          console.error("Error checking camera permissions:", error);
          setHasError(true);
        });
    }
  }, []);

  useEffect(() => {
    // set the showErrorModal variable when the showModal or errorMessage button is clicked
    if (errorMessage !== "" && showModal) {
      setShowErrorModal(true);
    }
  }, [showModal, errorMessage]);

  if (hasError) {
    return (
      <Container>
        <Card className="mt-5">
          <Card.Body>
            <Card.Header as="h2">Wheel Identification System</Card.Header>
            <div className="mt-3 flex">
              <Button variant="primary" onClick={startWebcam} className="me-2">
                Get Wheel ID
              </Button>
              <Button variant="success" onClick={startWebcam}>
                Train Wheel
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      {errorMessage &&
        !showModal && ( // show the error when showModal is false
          <div className="alert alert-danger" role="alert">
            {errorMessage}
          </div>
        )}

      <Card className="mt-5">
        <Card.Body>
          <Card.Header as="h2">Wheel Identification System</Card.Header>
          <div className="mt-3">
            <Button
              variant="primary"
              onClick={handleGetWheelID}
              className="me-2"
            >
              Get Wheel ID
            </Button>
            <Button variant="success" onClick={handleTrainWheel}>
              Train Wheel
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={closeModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Train Wheel</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div>
            <label>Add Wheel SKU:</label>
            <input
              className="form-control mb-2"
              type="text"
              onChange={tagChange}
              disabled={tagDisabled}
            />
            {recording ? (
              <Button onClick={stopRecording}>Stop Recording</Button>
            ) : (
              <Button onClick={startRecording}>Start Recording</Button>
            )}
            {videoURL && (
              <Button onClick={uploadVideo} className="ms-2">
                Start Uploading
              </Button>
            )}
            {/* <Button onClick={handleClear} className="ms-2"> // remove the clear model button
              Clear Model
            </Button> */}
          </div>
          {videoURL && (
            <div className="mt-3">
              <p>Recorded Video:</p>
              <video
                src={videoURL}
                controls
                style={{ width: "100%", maxHeight: "400px" }}
              />
            </div>
          )}
          <div style={{ position: "relative", marginTop: "20px" }}>
            <video
              ref={webcamRef}
              autoPlay
              playsInline
              style={{ width: "100%", maxHeight: "400px" }}
            />
            {/* Overlay circle with green border */}
            <div
              className="overlay-circle"
              style={{
                border: `5px solid ${tagDisabled ? "green" : "red"}`,
                backgroundColor: tagDisabled
                  ? "rgba(0, 0, 0, 0)"
                  : "rgba(0, 0, 0, 0.2)",
              }}
            >
              {tagDisabled ? (
                ""
              ) : (
                <div className="overlay-text">
                  Move closer until the object fits within the circle
                </div>
              )}
            </div>
          </div>
        </Modal.Body>
      </Modal>

      <Modal //======================== error modal part
        show={showErrorModal}
        onHide={closeErrorModal}
        style={{ marginTop: "100px" }}
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ color: "#ffaeb5" }}>Error</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {errorMessage && (
            <div className="alert alert-danger" role="alert">
              {errorMessage}
            </div>
          )}
        </Modal.Body>
      </Modal>

      <Modal
        show={showGetWheelID}
        onHide={() => {
          setShowGetWheelID(false);
          setCapturedImage(null);
        }}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Get Wheel ID</Modal.Title>
        </Modal.Header>
        {permissionGranted && !showModal && (
          <div className="mt-3">
            {/* Capture Image Button */}
            {showGetWheelID && (
              <>
                <Button onClick={capture} className="ms-2">
                  Capture Image
                </Button>
                {/* Upload Image Button */}
                {capturedImage && (
                  <Button onClick={handleCapture} className="ms-2">
                    Upload Image
                  </Button>
                )}
              </>
            )}

            {/* Display the captured image */}
            {capturedImage && (
              <div className="my-3">
                <p className="h5 ms-4">Captured Image:</p>
                <img
                  src={capturedImage}
                  alt="Captured"
                  style={{
                    width: "100%",
                    maxHeight: "400px",
                    marginBottom: "20px",
                    objectFit: "contain",
                  }}
                />
              </div>
            )}
            <div style={{ position: "relative", marginTop: "20px" }}>
              <video
                ref={webcamRef}
                autoPlay
                playsInline
                style={{ width: "100%", maxHeight: "400px" }}
              />
              {/* Overlay circle with green border */}
              <div
                className="overlay-circle"
                style={{
                  border: `5px solid ${tagDisabled ? "green" : "red"}`,
                  backgroundColor: tagDisabled
                    ? "rgba(0, 0, 0, 0)"
                    : "rgba(0, 0, 0, 0.2)",
                }}
              >
                {tagDisabled ? (
                  ""
                ) : (
                  <div className="overlay-text">
                    Move closer until the object fits within the circle
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        show={showModalWheelId}
        onHide={resetModal}
        size="md"
        className="mt-5"
      >
        <Modal.Header closeButton>
          <Modal.Title>Prediction Result</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            {predictionResult}
          </div>
          {showGetAnotherIDButton && (
            <Button variant="primary" className="mt-3" onClick={resetModal}>
              Get Another ID
            </Button>
          )}
          {showTrainWheelMessage && (
            <div
              style={{
                marginTop: "20px",
                textAlign: "center",
                fontWeight: "bold",
              }}
            >
              Train the wheel for better accuracy.
            </div>
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default WebCamCapture;
