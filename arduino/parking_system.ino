#include <Servo.h>

Servo gate;

int irIn = 2;
int irOut = 3;

int carCount = 0;
int maxCars = 5;   // Change parking capacity here

void setup() {
  Serial.begin(9600);

  pinMode(irIn, INPUT);
  pinMode(irOut, INPUT);

  gate.attach(9);
  gate.write(0);   // Gate closed position

  Serial.println("Car Parking System Started");
}

void loop() {

  // Car Enter
  if (digitalRead(irIn) == LOW) {
    if (carCount < maxCars) {
      carCount++;
      Serial.print("Car Entered. Total Cars: ");
      Serial.println(carCount);

      openGate();
      delay(2000);
      closeGate();
    }
    else {
      Serial.println("Parking Full!");
    }
    delay(1000);
  }

  // Car Exit
  if (digitalRead(irOut) == LOW) {
    if (carCount > 0) {
      carCount--;
      Serial.print("Car Exited. Total Cars: ");
      Serial.println(carCount);

      openGate();
      delay(2000);
      closeGate();
    }
    delay(1000);
  }
}

void openGate() {
  gate.write(90);   // Open position
}

void closeGate() {
  gate.write(0);    // Close position
}
