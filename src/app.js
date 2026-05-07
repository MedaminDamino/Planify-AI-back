import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();

// Middlewares
app.use(cors());

app.use(helmet());

app.use(morgan("dev"));

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// Static uploads folder
app.use("/uploads", express.static("uploads"));

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Planify AI API running",
  });
});

app.use(errorMiddleware);

app.use("/api/auth", authRoutes);

export default app;
