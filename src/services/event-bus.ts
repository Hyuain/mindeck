/**
 * Typed in-process event bus for inter-component messaging.
 * Ephemeral — events are signals only; durable state lives in JSONL + Zustand.
 */

import type { TaskDispatchEvent, TaskStatusEvent, TaskResultEvent } from "@/types"
import { createLogger } from "./logger"

const log = createLogger("EventBus")

type BusEventMap = {
  "task:dispatch": TaskDispatchEvent
  "task:status": TaskStatusEvent
  "task:result": TaskResultEvent
}

type BusEventKey = keyof BusEventMap
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener<T = any> = (event: T) => void

class TypedEventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Partial<Record<BusEventKey, Set<Listener<any>>>> = {}

  on<K extends BusEventKey>(event: K, listener: Listener<BusEventMap[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set()
    }
    this.listeners[event]!.add(listener)
    return () => this.off(event, listener)
  }

  off<K extends BusEventKey>(event: K, listener: Listener<BusEventMap[K]>): void {
    this.listeners[event]?.delete(listener)
  }

  emit<K extends BusEventKey>(event: K, data: BusEventMap[K]): void {
    const listeners = this.listeners[event]
    if (!listeners) return
    for (const listener of listeners) {
      try {
        const result = listener(data) as unknown
        if (result instanceof Promise) {
          result.catch((err: unknown) =>
            log.error(`Async error in listener for "${event}"`, err)
          )
        }
      } catch (err) {
        log.error(`Error in listener for "${event}"`, err)
      }
    }
  }

  once<K extends BusEventKey>(event: K, listener: Listener<BusEventMap[K]>): () => void {
    const wrapped: Listener<BusEventMap[K]> = (data) => {
      listener(data)
      this.off(event, wrapped)
    }
    return this.on(event, wrapped)
  }
}

/** Singleton event bus — import this anywhere */
export const eventBus = new TypedEventBus()
