from flask import Flask, request, render_template, Response
import cv2, datetime, os


global capture
capture = 0

app = Flask(__name__)

cam = cv2.VideoCapture(0, cv2.CAP_DSHOW)

@app.route("/")
def index():
    return render_template('index.html')

@app.route("/cam_feed")
def cam_feed():
    return Response(live_cam(), mimetype='multipart/x-mixed-replace; boundary=frame')

def live_cam():
    global capture
    while True:
        ret, frame = cam.read()
        # if not ret:
        #     print("failed to grab frame")
        #     break
        if ret:
            # if(capture):
            #     capture=0
            #     now = datetime.datetime.now()
            #     p = os.path.sep.join(['shots', "shot_{}.png".format(str(now).replace(":",''))])
            #     cv2.imwrite(p, frame)
        
            try:
                ret, buffer = cv2.imencode('.jpg', cv2.flip(frame,1))
                frame = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            except Exception as e:
                pass
                
        else:
            pass


if __name__ == '__main__':
    app.run()