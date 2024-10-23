const { Router } = require("express");
const router = Router();
const Upload = require("../utils/multerConfig")
const trainController = require("../controller/traint/trainController")

router.post("/train", Upload.single('video'), trainController.trainImage)


module.exports = router;