const { Router } = require("express");
const router = Router();
const Upload = require("../utils/multerConfig")
const predictController = require("../controller/predict/predictController")

router.post("/predict", Upload.single("image"), predictController.predictImage)


module.exports = router;