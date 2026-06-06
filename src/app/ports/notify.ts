// NotifyPort — AI→human push channel (S3 Unit-03 NotifyPort). v0 default is a
// no-op (notification US-31 is v0.0.x); the port exists so the inbox→notify
// wiring is honest and swappable. Never throws into the run path.
import type { Question } from "../../domain/question/question";

export interface NotifyPort {
  questionRaised(question: Question): Promise<void> | void;
}
