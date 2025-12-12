from flask import Flask, request, render_template, Response
import cv2, datetime, os


global capture, bnw
bnw = 0
capture = 0

app = Flask(__name__)

cam = cv2.VideoCapture(0, cv2.CAP_DSHOW)

@app.route("/")
def index():
    return render_template('index.html')

@app.route("/cam_feed")
def cam_feed():
    return Response(live_cam(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/filters", methods=["POST"])
def filters():
    if request.method == "POST":
        if request.form.get('bnw') == "BNW":
            global bnw
            bnw = not bnw
        if request.form.get('capture') == "Capture":
            global capture
            capture = not capture
            return "<h1>test</h1>"
    else:
        return render_template('index.html')

    return render_template('index.html')




def live_cam():
    global capture, bnw
    while True:
        ret, frame = cam.read(0)
        if ret:
            if(bnw):
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            if(capture):
                capture=0

        
            try:
                ret, buffer = cv2.imencode('.jpg', cv2.flip(frame,1))
                frame = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            except Exception as e:
                pass
        else:
            print("failed to grab frame")
            break



if __name__ == '__main__':
    app.run()